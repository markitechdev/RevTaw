import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeConceptName } from "@/lib/concepts/service";
import { median } from "@/lib/engine/answers";
import { ENGINE } from "@/lib/engine/config";
import { SCENARIO_CHOICE } from "@/lib/engine/knowledge";
import type { EngineEvent, EngineEventKind } from "@/lib/engine/mastery-model";
import { parseAnalysisData, type ConceptCategory } from "@/lib/materials/analysis-schema";
import { DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/planner/dates";
import type { Database, MasteryStatus, QuestionDifficulty, QuestionType, SessionItemKind } from "@/lib/supabase/database.types";
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

/** What one read found, and whether a cap cut older rows off (then some concepts may be missing answers). */
export type EvidenceRead = { byConcept: Map<string, ConceptEvidence>; truncated: boolean };

/** Rows read per kind of evidence, newest first. */
export const EVIDENCE_CAPS = { answers: 10_000, items: 10_000, reviews: 10_000, mistakes: 5_000 } as const;

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

const QUESTION_TYPES: ReadonlySet<string> = new Set<QuestionType>([
  "identification",
  "multiple_choice",
  "true_false",
  "two_statement",
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

/**
 * A session item's question type: its format when that is a quiz question type, otherwise its kind. A
 * scenario drill is a choice among 3–5 actions with a justification, not an open scenario question.
 */
function itemType(kind: SessionItemKind, format: string | null): string {
  if (kind === "scenario") return SCENARIO_CHOICE;
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
 * `conceptIds` the queries are narrowed to those concepts. `truncated` says a
 * kind reached its cap, so older answers were left out.
 */
export async function collectEvidence(supabase: Client, userId: string, conceptIds: string[] | null): Promise<EvidenceRead> {
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
            .not("is_correct", "is", null)
            // A question left unanswered scores 0 in its attempt but says nothing about what the student knows.
            .not("response", "is", null),
          "question.concept_id",
        )
          .order("answered_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      EVIDENCE_CAPS.answers,
    ),
    readPages(
      (from, to) =>
        narrow(
          supabase
            .from("study_session_items")
            .select("id, kind, format, concept_id, is_correct, confidence, response_ms, answered_at")
            .eq("user_id", userId)
            .not("answered_at", "is", null)
            .not("is_correct", "is", null)
            // A question the student wrote is rated for its quality, not answered: no evidence of what they know.
            .neq("kind", "question"),
          "concept_id",
        )
          .order("answered_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      EVIDENCE_CAPS.items,
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
      EVIDENCE_CAPS.reviews,
    ),
    readPages((from, to) => narrow(supabase.from("mistakes").select("concept_id").eq("user_id", userId).is("resolved_at", null), "concept_id").order("id").range(from, to), EVIDENCE_CAPS.mistakes),
  ]);
  const truncated = answers.length >= EVIDENCE_CAPS.answers || items.length >= EVIDENCE_CAPS.items || reviews.length >= EVIDENCE_CAPS.reviews || mistakes.length >= EVIDENCE_CAPS.mistakes;

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
      // A rating is how well the card was recalled, not how sure the student felt: "Hard" means recalled with
      // effort, not unsure. The day's review reads the rating itself (mastery-model dailyReviews).
      confidence: null,
      responseMs: row.response_ms,
      rating: row.rating,
    });
  }
  for (const row of mistakes) {
    if (row.concept_id) entry(row.concept_id).openMistakes += 1;
  }
  for (const value of byConcept.values()) value.events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return { byConcept, truncated };
}

/** How long a server instance reuses a student's response-time medians (they move slowly; every answer used to read 800 rows). */
const MEDIANS_TTL_MS = 10 * 60_000;
const MEDIANS_CACHED_MAX = 1000;
const cachedMedians = new Map<string, { value: Record<string, number | null>; until: number }>();

/**
 * The student's median response time per question type, from their latest timed answers. Each server
 * instance keeps a student's medians for ten minutes, so a run of answers reads them once.
 */
async function responseMedians(supabase: Client, userId: string): Promise<Record<string, number | null>> {
  const hit = cachedMedians.get(userId);
  if (hit && hit.until > Date.now()) return hit.value;
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
  const value = Object.fromEntries([...byType].map(([type, values]) => [type, median(values)]));
  // A failed read is never kept.
  if (!answers.error && !items.error) {
    cachedMedians.delete(userId);
    if (cachedMedians.size >= MEDIANS_CACHED_MAX) cachedMedians.delete(cachedMedians.keys().next().value!);
    cachedMedians.set(userId, { value, until: Date.now() + MEDIANS_TTL_MS });
  }
  return value;
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

/** Answers-weighted mean of the student's concept ratings, shrunk toward 0 while there are few answers. */
export function abilityOf(rows: Array<{ elo_rating: number; elo_answers: number }>): number {
  let weighted = 0;
  let answers = 0;
  for (const row of rows) {
    if (row.elo_answers <= 0) continue;
    weighted += Number(row.elo_rating) * row.elo_answers;
    answers += row.elo_answers;
  }
  return abilityFromTotals(weighted, answers);
}

/** The same from the two sums (sum of rating × answers, sum of answers). */
export function abilityFromTotals(weighted: number, answers: number): number {
  return answers <= 0 ? 0 : weighted / (answers + ENGINE.elo.abilityPriorAnswers);
}

/** The student's overall ability from student_elo_totals() (migration 0030), without reading every mastery row. */
async function studentAbility(supabase: Client, userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("student_elo_totals", { p_user_id: userId });
  if (!error && data?.[0]) return abilityFromTotals(Number(data[0].weighted), Number(data[0].answers));
  // Before the migration is applied: the same from the rows.
  if (error) console.error("student_elo_totals failed; reading the rows instead", error.message);
  const rows = await readPages((from, to) => supabase.from("concept_mastery").select("elo_rating, elo_answers").eq("user_id", userId).gt("elo_answers", 0).order("concept_id").range(from, to), 10_000);
  return abilityOf(rows.map((row) => ({ elo_rating: Number(row.elo_rating), elo_answers: row.elo_answers })));
}

/** A full recompute reads every row anyway; a few concepts are read by id. */
const PREVIOUS_BY_ID_MAX = 300;

type PreviousRow = { concept_id: string; best_status: MasteryStatus | null; elo_start: number | null };

/** What the targets' mastery rows keep between recomputes (best state reached, where the rating started). */
async function previousRows(supabase: Client, userId: string, conceptIds: string[]): Promise<PreviousRow[]> {
  const columns = "concept_id, best_status, elo_start";
  if (conceptIds.length > PREVIOUS_BY_ID_MAX) {
    return readPages((from, to) => supabase.from("concept_mastery").select(columns).eq("user_id", userId).order("concept_id").range(from, to), 10_000);
  }
  const pages = await Promise.all(chunked([...new Set(conceptIds)]).map((chunk) => supabase.from("concept_mastery").select(columns).eq("user_id", userId).in("concept_id", chunk)));
  const failed = pages.find((page) => page.error);
  if (failed?.error) throw new Error(`concept_mastery: read failed: ${failed.error.message}`);
  return pages.flatMap((page) => page.data ?? []);
}

export async function loadModelContext(supabase: Client, userId: string, conceptIds: string[]): Promise<ModelContext> {
  const [{ data: profile }, medians, buckets, categories, previous, ability] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
    responseMedians(supabase, userId),
    loadBuckets(supabase),
    conceptCategories(supabase, conceptIds, userId),
    previousRows(supabase, userId, conceptIds),
    studentAbility(supabase, userId),
  ]);
  const zone = profile?.timezone;
  return {
    timeZone: isValidTimezone(zone) ? zone : DEFAULT_TIMEZONE,
    medians,
    buckets,
    categories,
    previous: new Map(previous.map((row) => [row.concept_id, { bestStatus: row.best_status, eloStart: row.elo_start === null ? null : Number(row.elo_start) }])),
    ability,
  };
}
