import "server-only";

import { cache } from "react";

import { computeMastery, type EvidenceEvent } from "@/lib/adaptive/mastery";
import type { ConceptMastery, FlashcardRating } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const RATING_CONFIDENCE: Record<FlashcardRating, EvidenceEvent["confidence"]> = {
  again: "guessing",
  hard: "unsure",
  good: "somewhat_confident",
  easy: "very_confident",
};

/**
 * Gathers every graded event per concept from the evidence tables. With
 * `conceptIds` the query is narrowed; otherwise all of the student's
 * concepts are covered (bounded by the row limits below).
 */
async function collectEvidence(supabase: Client, conceptIds: string[] | null): Promise<Map<string, { events: EvidenceEvent[]; openMistakes: number }>> {
  const byConcept = new Map<string, { events: EvidenceEvent[]; openMistakes: number }>();
  const bucket = (id: string) => {
    const entry = byConcept.get(id) ?? { events: [], openMistakes: 0 };
    byConcept.set(id, entry);
    return entry;
  };
  const narrow = <T extends { in: (column: string, values: string[]) => T }>(query: T, column: string) => (conceptIds ? query.in(column, conceptIds) : query);

  const [answers, items, reviews, mistakes] = await Promise.all([
    narrow(
      supabase
        .from("quiz_answers")
        .select("is_correct, confidence, response_ms, answered_at, question:quiz_questions!quiz_answers_question_fk(concept_id, difficulty)")
        .not("is_correct", "is", null)
        .order("answered_at", { ascending: false })
        .limit(3000),
      "question.concept_id",
    ),
    narrow(
      supabase
        .from("study_session_items")
        .select("kind, concept_id, is_correct, confidence, response_ms, answered_at")
        .not("answered_at", "is", null)
        .not("is_correct", "is", null)
        .order("answered_at", { ascending: false })
        .limit(2000),
      "concept_id",
    ),
    narrow(
      supabase
        .from("flashcard_reviews")
        .select("rating, response_ms, reviewed_at, card:flashcards!flashcard_reviews_card_fk(concept_id)")
        .order("reviewed_at", { ascending: false })
        .limit(3000),
      "card.concept_id",
    ),
    narrow(supabase.from("mistakes").select("concept_id").is("resolved_at", null).not("concept_id", "is", null).limit(2000), "concept_id"),
  ]);

  for (const row of answers.data ?? []) {
    const question = row.question as unknown as { concept_id: string | null; difficulty: EvidenceEvent["difficulty"] } | null;
    if (!question?.concept_id) continue;
    bucket(question.concept_id).events.push({ at: row.answered_at, kind: "quiz", correct: Boolean(row.is_correct), difficulty: question.difficulty, confidence: row.confidence, responseMs: row.response_ms });
  }
  for (const row of items.data ?? []) {
    if (!row.concept_id || !row.answered_at) continue;
    bucket(row.concept_id).events.push({
      at: row.answered_at,
      kind: row.kind === "feynman" ? "feynman" : row.kind === "mistake" ? "mistake" : "recall",
      correct: Boolean(row.is_correct),
      difficulty: row.kind === "feynman" ? "hard" : "medium",
      confidence: row.confidence,
      responseMs: row.response_ms,
    });
  }
  for (const row of reviews.data ?? []) {
    const card = row.card as unknown as { concept_id: string | null } | null;
    if (!card?.concept_id) continue;
    bucket(card.concept_id).events.push({ at: row.reviewed_at, kind: "flashcard", correct: row.rating !== "again", difficulty: "easy", confidence: RATING_CONFIDENCE[row.rating], responseMs: row.response_ms });
  }
  for (const row of mistakes.data ?? []) {
    if (row.concept_id) bucket(row.concept_id).openMistakes += 1;
  }
  return byConcept;
}

/**
 * Recomputes and caches mastery for the given concepts (or every concept
 * with evidence). Called after quizzes, sessions, reviews and notebook
 * changes; safe to call often.
 */
export async function recomputeMastery(conceptIds: string[] | null = null): Promise<number> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("id").maybeSingle();
  if (!profile) return 0;
  const ids = conceptIds ? [...new Set(conceptIds.filter(Boolean))] : null;
  if (ids && ids.length === 0) return 0;

  const evidence = await collectEvidence(supabase, ids);
  const targets = ids ?? [...evidence.keys()];
  if (targets.length === 0) return 0;
  const now = new Date();
  const rows = targets.map((conceptId) => {
    const entry = evidence.get(conceptId) ?? { events: [], openMistakes: 0 };
    const result = computeMastery({ events: entry.events, openMistakes: entry.openMistakes, now });
    return {
      user_id: profile.id,
      concept_id: conceptId,
      mastery: result.mastery,
      retrieval_strength: result.retrievalStrength,
      status: result.status,
      next_difficulty: result.nextDifficulty,
      attempts: result.attempts,
      correct: result.correct,
      incorrect: result.incorrect,
      streak: result.streak,
      open_mistakes: entry.openMistakes,
      misconceptions: result.misconceptions,
      underconfident: result.underconfident,
      avg_confidence: result.avgConfidence,
      avg_response_ms: result.avgResponseMs,
      trend: result.trend,
      last_practiced_at: result.lastPracticedAt,
      next_review_at: result.nextReviewAt,
      computed_at: now.toISOString(),
    };
  });
  const { error } = await supabase.from("concept_mastery").upsert(rows, { onConflict: "user_id,concept_id" });
  if (error) console.error("concept_mastery: upsert failed", error.message);
  return rows.length;
}

/** Fire-and-forget variant for request handlers: never throws, logs failures. */
export async function refreshMastery(conceptIds: string[] | null): Promise<void> {
  try {
    await recomputeMastery(conceptIds);
  } catch (error) {
    console.error("concept_mastery: refresh failed", error);
  }
}

export type MasteryView = ConceptMastery & {
  concept: { id: string; name: string; material_id: string | null; material: { id: string; title: string } | null } | null;
};

const MASTERY_COLUMNS = "*, concept:concepts!concept_mastery_concept_fk(id, name, material_id, material:materials!concepts_material_fk(id, title))";

export const listMastery = cache(async (filters: { materialId?: string } = {}): Promise<MasteryView[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("concept_mastery").select(MASTERY_COLUMNS).order("mastery", { ascending: true }).limit(500);
  if (error) {
    console.error("concept_mastery: list failed", error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as MasteryView[];
  return filters.materialId ? rows.filter((row) => row.concept?.material_id === filters.materialId) : rows;
});

export type MasterySummary = {
  total: number;
  weak: MasteryView[];
  learning: MasteryView[];
  strong: MasteryView[];
  mastered: MasteryView[];
  dueForReview: MasteryView[];
  misconceptions: MasteryView[];
  underconfident: MasteryView[];
  averageMastery: number | null;
};

export const getMasterySummary = cache(async (filters: { materialId?: string } = {}): Promise<MasterySummary> => {
  const rows = await listMastery(filters);
  const now = new Date().toISOString();
  const practiced = rows.filter((row) => row.attempts > 0);
  return {
    total: practiced.length,
    weak: practiced.filter((row) => row.status === "weak"),
    learning: practiced.filter((row) => row.status === "learning"),
    strong: practiced.filter((row) => row.status === "strong"),
    mastered: practiced.filter((row) => row.status === "mastered"),
    dueForReview: practiced.filter((row) => row.next_review_at && row.next_review_at <= now && row.status !== "weak").sort((a, b) => Number(a.retrieval_strength) - Number(b.retrieval_strength)),
    misconceptions: practiced.filter((row) => row.misconceptions > 0).sort((a, b) => b.misconceptions - a.misconceptions),
    underconfident: practiced.filter((row) => row.underconfident > 0).sort((a, b) => b.underconfident - a.underconfident),
    averageMastery: practiced.length ? Math.round(practiced.reduce((sum, row) => sum + Number(row.mastery), 0) / practiced.length) : null,
  };
});

/** Concept names that need work, best signal first (for prompts that focus generation). */
export async function weakConceptNames(materialId: string | null, limit = 6): Promise<string[]> {
  const summary = await getMasterySummary(materialId ? { materialId } : {});
  const ranked = [...summary.weak, ...summary.misconceptions, ...summary.learning, ...summary.dueForReview];
  const names: string[] = [];
  for (const row of ranked) {
    const name = row.concept?.name;
    if (name && !names.includes(name)) names.push(name);
    if (names.length >= limit) break;
  }
  return names;
}

/** Per-concept target difficulty for adaptive question generation. */
export async function difficultyTargets(materialId: string): Promise<Array<{ concept: string; difficulty: "easy" | "medium" | "hard" | "advanced" }>> {
  const rows = await listMastery({ materialId });
  return rows.filter((row) => row.concept && row.attempts > 0).map((row) => ({ concept: row.concept!.name, difficulty: row.next_difficulty }));
}
