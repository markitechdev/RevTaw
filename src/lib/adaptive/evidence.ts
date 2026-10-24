import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeConceptName } from "@/lib/concepts/service";
import { median } from "@/lib/engine/answers";
import { ENGINE } from "@/lib/engine/config";
import type { EngineEvent, EngineEventKind } from "@/lib/engine/mastery-model";
import { parseAnalysisData, type ConceptCategory } from "@/lib/materials/analysis-schema";
import { DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/planner/dates";
import type { ConfidenceLevel, Database, FlashcardRating, MasteryStatus, QuestionDifficulty, QuestionType, SessionItemKind } from "@/lib/supabase/database.types";
import { readPages as readAllPages } from "@/lib/supabase/paginate";

/**
 * What the learning engine reads for one student: every graded answer per
 * concept, and the context the concept model needs (time zone, response-time
 * medians, shared item buckets, concept categories, the starting point of
 * each concept's rating). Every query filters by the student's id, so it is
 * safe with the server's secret-key client in nightly jobs as well as with
 * the signed-in student's client.
 */

type Client = SupabaseClient<Database>;

export type ConceptEvidence = { events: EngineEvent[]; openMistakes: number };

export type ModelContext = {
  timeZone: string;
  /** The student's median response time per question type (null until there are enough timed answers). */
  medians: Record<string, number | null>;
  /** Learned bucket difficulties (logits) by bucket key. */
  buckets: ReadonlyMap<string, number>;
  categories: Map<string, ConceptCategory>;
  previous: Map<string, { bestStatus: MasteryStatus | null; eloStart: number | null }>;
  /** Overall ability: where a concept's rating starts the first time it is answered. */
  ability: number;
};

/** Self-rated flashcards carry no confidence of their own; the rating stands in for it. */
const RATING_CONFIDENCE: Record<FlashcardRating, ConfidenceLevel> = { again: "guessing", hard: "unsure", good: "somewhat_confident", easy: "very_confident" };

const QUESTION_TYPES: ReadonlySet<string> = new Set<QuestionType>([
  "identification",
  "multiple_choice",
  "true_false",
  "fill_blank",
  "short_answer",
  "essay",
  "scenario",
  "case_based",
  "problem_solving",
]);

export const DEFAULT_CATEGORY: ConceptCategory = "understanding";
/** Ids per `in (…)` list: keeps request URLs short. */
const IN_LIST_LIMIT = 150;

function eventKind(kind: SessionItemKind): EngineEventKind {
  return kind === "feynman" ? "feynman" : kind === "mistake" ? "mistake" : kind === "recall" ? "recall" : "item";
}

/** A session item's question type: its format when that is a quiz question type, otherwise its kind. */
function itemType(kind: SessionItemKind, format: string | null): string {
  return format && QUESTION_TYPES.has(format) ? format : kind;
}

export function optionCount(options: unknown): number | null {
  return Array.isArray(options) && options.length >= 2 ? options.length : null;
}

/**
 * Reads a query a page at a time (newest first, so a cap keeps the latest
 * rows), up to `maxRows`: the shared reader (lib/supabase/paginate) with the
 * engine's error prefix.
 */
export async function readPages<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, maxRows: number): Promise<T[]> {
  try {
    return await readAllPages(build, maxRows);
  } catch (error) {
    throw new Error(`mastery evidence: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Every graded answer per concept, oldest first: quiz answers, study-session
 * items and flashcard reviews, plus open notebook mistakes. With
 * `conceptIds` the queries are narrowed to those concepts.
 */
export async function collectEvidence(supabase: Client, userId: string, conceptIds: string[] | null): Promise<Map<string, ConceptEvidence>> {
  const byConcept = new Map<string, ConceptEvidence>();
  const entry = (id: string) => {
    const value = byConcept.get(id) ?? { events: [], openMistakes: 0 };
    byConcept.set(id, value);
    return value;
  };
  // Filters on an embedded table only narrow the parent rows with `!inner` joins (used below).
  const narrow = <T extends { in: (column: string, values: string[]) => T; not: (column: string, operator: string, value: null) => T }>(query: T, column: string) =>
    conceptIds ? query.in(column, conceptIds) : query.not(column, "is", null);

  const [answers, items, reviews, mistakes] = await Promise.all([
    readPages(
      (from, to) =>
        narrow(
          supabase
            .from("quiz_answers")
            .select("question_id, is_correct, confidence, response_ms, answered_at, question:quiz_questions!quiz_answers_question_fk!inner(concept_id, difficulty, type, options)")
            .eq("user_id", userId)
            .not("is_correct", "is", null),
          "question.concept_id",
        )
          .order("answered_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      10_000,
    ),
    readPages(
      (from, to) =>
        narrow(
          supabase
            .from("study_session_items")
            .select("id, kind, format, concept_id, is_correct, confidence, response_ms, answered_at")
            .eq("user_id", userId)
            .not("answered_at", "is", null)
            .not("is_correct", "is", null),
          "concept_id",
        )
          .order("answered_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      6_000,
    ),
    readPages(
      (from, to) =>
        narrow(
          supabase.from("flashcard_reviews").select("card_id, rating, response_ms, reviewed_at, card:flashcards!flashcard_reviews_card_fk!inner(concept_id)").eq("user_id", userId),
          "card.concept_id",
        )
          .order("reviewed_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      10_000,
    ),
    readPages((from, to) => narrow(supabase.from("mistakes").select("concept_id").eq("user_id", userId).is("resolved_at", null), "concept_id").order("id").range(from, to), 5_000),
  ]);

  // Quiz answers, oldest first, so the first answer to each question is its first attempt.
  const seenQuestions = new Set<string>();
  for (const row of [...answers].reverse()) {
    const question = row.question as unknown as { concept_id: string | null; difficulty: QuestionDifficulty; type: QuestionType; options: unknown } | null;
    if (!question?.concept_id) continue;
    const firstAttempt = !seenQuestions.has(row.question_id);
    seenQuestions.add(row.question_id);
    entry(question.concept_id).events.push({
      at: row.answered_at,
      kind: "quiz",
      itemKey: `q:${row.question_id}`,
      correct: Boolean(row.is_correct),
      difficulty: question.difficulty,
      questionType: question.type,
      optionCount: optionCount(question.options),
      firstAttempt,
      confidence: row.confidence,
      responseMs: row.response_ms,
    });
  }
  for (const row of items) {
    if (!row.concept_id || !row.answered_at) continue;
    entry(row.concept_id).events.push({
      at: row.answered_at,
      kind: eventKind(row.kind),
      itemKey: `s:${row.id}`,
      correct: Boolean(row.is_correct),
      difficulty: row.kind === "feynman" ? "hard" : "medium",
      questionType: itemType(row.kind, row.format),
      optionCount: null,
      firstAttempt: true,
      confidence: row.confidence,
      responseMs: row.response_ms,
    });
  }
  for (const row of reviews) {
    const card = row.card as unknown as { concept_id: string | null } | null;
    if (!card?.concept_id) continue;
    entry(card.concept_id).events.push({
      at: row.reviewed_at,
      kind: "flashcard",
      itemKey: `c:${row.card_id}`,
      correct: row.rating !== "again",
      difficulty: "easy",
      questionType: "flashcard",
      optionCount: null,
      firstAttempt: false,
      confidence: RATING_CONFIDENCE[row.rating],
      responseMs: row.response_ms,
      rating: row.rating,
    });
  }
  for (const row of mistakes) {
    if (row.concept_id) entry(row.concept_id).openMistakes += 1;
  }
  for (const value of byConcept.values()) value.events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return byConcept;
}

/** The student's median response time per question type, from their latest timed answers. */
async function responseMedians(supabase: Client, userId: string): Promise<Record<string, number | null>> {
  const [answers, items] = await Promise.all([
    supabase
      .from("quiz_answers")
      .select("response_ms, question:quiz_questions!quiz_answers_question_fk!inner(type)")
      .eq("user_id", userId)
      .gt("response_ms", 0)
      .order("answered_at", { ascending: false })
      .limit(500),
    supabase.from("study_session_items").select("kind, format, response_ms").eq("user_id", userId).gt("response_ms", 0).order("answered_at", { ascending: false }).limit(300),
  ]);
  const byType = new Map<string, number[]>();
  const add = (type: string, ms: number | null) => {
    if (!ms || ms <= 0) return;
    const list = byType.get(type) ?? [];
    list.push(ms);
    byType.set(type, list);
  };
  for (const row of answers.data ?? []) add((row.question as unknown as { type: string } | null)?.type ?? "quiz", row.response_ms);
  for (const row of items.data ?? []) add(itemType(row.kind, row.format), row.response_ms);
  return Object.fromEntries([...byType].map(([type, values]) => [type, median(values)]));
}

/** Splits ids into `in (…)` lists short enough for a request URL. */
export function chunked<T>(items: T[], size: number = IN_LIST_LIMIT): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

/**
 * Concept id → content category, from each material's analysis (key
 * concepts matched by name). With `userId` only that student's rows are
 * read; without it (nightly bucket refit, secret-key client) any student's.
 */
export async function conceptCategories(supabase: Client, conceptIds: string[], userId?: string): Promise<Map<string, ConceptCategory>> {
  const result = new Map<string, ConceptCategory>();
  const ids = [...new Set(conceptIds)];
  if (ids.length === 0) return result;
  const conceptPages = await Promise.all(
    chunked(ids).map((chunk) => {
      const query = supabase.from("concepts").select("id, normalized_name, material_id").in("id", chunk);
      return userId ? query.eq("user_id", userId) : query;
    }),
  );
  const rows = conceptPages.flatMap((page) => page.data ?? []);
  const materialIds = [...new Set(rows.map((concept) => concept.material_id).filter((id): id is string => Boolean(id)))];
  const analysisPages = await Promise.all(
    chunked(materialIds).map((chunk) => {
      const query = supabase.from("material_analyses").select("material_id, key_concepts:data->key_concepts").in("material_id", chunk);
      return userId ? query.eq("user_id", userId) : query;
    }),
  );
  const byMaterial = new Map<string, Map<string, ConceptCategory>>();
  for (const analysis of analysisPages.flatMap((page) => page.data ?? [])) {
    const parsed = parseAnalysisData({ key_concepts: (analysis as { key_concepts: unknown }).key_concepts ?? [] });
    byMaterial.set(analysis.material_id, new Map(parsed.key_concepts.map((concept) => [normalizeConceptName(concept.name), concept.category])));
  }
  for (const concept of rows) {
    const category = concept.material_id ? byMaterial.get(concept.material_id)?.get(concept.normalized_name) : undefined;
    result.set(concept.id, category ?? DEFAULT_CATEGORY);
  }
  return result;
}

/** How long a server instance reuses the shared item buckets before reading them again. */
export const BUCKETS_TTL_MS = 10 * 60_000;
let cachedBuckets: { value: ReadonlyMap<string, number>; until: number } | null = null;

/**
 * Shared item buckets (difficulty in logits by bucket key). Readable by every
 * signed-in student and the same for all of them, refit once a night, so each
 * server instance keeps a good read for ten minutes instead of reading the
 * table for every graded answer. An empty or failed read is never kept.
 */
export async function loadBuckets(supabase: Client): Promise<ReadonlyMap<string, number>> {
  if (cachedBuckets && cachedBuckets.until > Date.now()) return cachedBuckets.value;
  const { data, error } = await supabase.from("item_buckets").select("bucket_key, difficulty").limit(2000);
  const value: ReadonlyMap<string, number> = new Map((data ?? []).map((row) => [row.bucket_key, Number(row.difficulty)]));
  if (!error && value.size > 0) cachedBuckets = { value, until: Date.now() + BUCKETS_TTL_MS };
  return value;
}

/** Drops this instance's copy, so the next read sees a refit straight away. */
export function forgetCachedBuckets(): void {
  cachedBuckets = null;
}

/** Answers-weighted mean of the student's concept ratings, shrunk towards 0 while there are few answers. */
export function abilityOf(rows: Array<{ elo_rating: number; elo_answers: number }>): number {
  let weighted = 0;
  let answers = 0;
  for (const row of rows) {
    if (row.elo_answers <= 0) continue;
    weighted += Number(row.elo_rating) * row.elo_answers;
    answers += row.elo_answers;
  }
  return answers === 0 ? 0 : weighted / (answers + ENGINE.elo.abilityPriorAnswers);
}

export async function loadModelContext(supabase: Client, userId: string, conceptIds: string[]): Promise<ModelContext> {
  const [{ data: profile }, medians, buckets, categories, mastery] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
    responseMedians(supabase, userId),
    loadBuckets(supabase),
    conceptCategories(supabase, conceptIds, userId),
    readPages((from, to) => supabase.from("concept_mastery").select("concept_id, best_status, elo_start, elo_rating, elo_answers").eq("user_id", userId).order("concept_id").range(from, to), 10_000),
  ]);
  const rows = mastery;
  const zone = profile?.timezone;
  return {
    timeZone: isValidTimezone(zone) ? zone : DEFAULT_TIMEZONE,
    medians,
    buckets,
    categories,
    previous: new Map(rows.map((row) => [row.concept_id, { bestStatus: row.best_status, eloStart: row.elo_start === null ? null : Number(row.elo_start) }])),
    ability: abilityOf(rows),
  };
}
