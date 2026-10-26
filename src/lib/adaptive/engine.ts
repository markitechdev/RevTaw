import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { abilityOf, chunked, collectEvidence, loadModelContext, readPages } from "@/lib/adaptive/evidence";
import { isWeakTopic, needsRefresh } from "@/lib/adaptive/mastery";
import { ENGINE } from "@/lib/engine/config";
import { chooseDifficulty, labelPrior } from "@/lib/engine/elo";
import { guessFloor } from "@/lib/engine/knowledge";
import { modelConcept } from "@/lib/engine/mastery-model";
import { CONCEPT_STATES } from "@/lib/engine/types";
import { awardMasteredXp } from "@/lib/gamification/service";
import type { ConceptMastery, Database, MasteryStatus, QuestionDifficulty } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Client = SupabaseClient<Database>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The higher of two states (the highest state reached is kept, so a drop from forgetting reads as a refresh). */
function higherState(a: MasteryStatus | null, b: MasteryStatus): MasteryStatus {
  return a !== null && CONCEPT_STATES.indexOf(a) > CONCEPT_STATES.indexOf(b) ? a : b;
}

/**
 * Recomputes and caches one student's mastery for the given concepts (or
 * every concept with evidence) with the learning engine: BKT × FSRS recall,
 * evidence gates, Elo and weakness. Works with the student's own client or,
 * in nightly jobs, the secret-key client (every query filters by `userId`).
 * XP for first-time mastery is only awarded on the student's own client.
 */
export async function recomputeMasteryFor(supabase: Client, userId: string, conceptIds: string[] | null, options: { now?: Date; awardXp?: boolean } = {}): Promise<number> {
  const ids = conceptIds ? [...new Set(conceptIds.filter(Boolean))] : null;
  if (ids && ids.length === 0) return 0;

  const evidence = await collectEvidence(supabase, userId, ids);
  let targets = ids ?? [...evidence.keys()];
  if (!ids) {
    // A full run also refreshes concepts whose evidence was deleted, so no row is left stale.
    const practiced = await readPages((from, to) => supabase.from("concept_mastery").select("concept_id").eq("user_id", userId).gt("attempts", 0).order("concept_id").range(from, to), 10_000);
    targets = [...new Set([...targets, ...practiced.map((row) => row.concept_id)])];
  }
  if (targets.length === 0) return 0;
  const context = await loadModelContext(supabase, userId, targets);
  const now = options.now ?? new Date();
  const rows = targets.map((conceptId) => {
    const entry = evidence.get(conceptId) ?? { events: [], openMistakes: 0 };
    const previous = context.previous.get(conceptId);
    // A concept's rating starts at the student's ability the first time it is answered, and stays anchored there.
    const start = previous?.eloStart ?? context.ability;
    const model = modelConcept({
      events: entry.events,
      openMistakes: entry.openMistakes,
      category: context.categories.get(conceptId) ?? "understanding",
      ability: start,
      bucketDifficulty: (key) => context.buckets.get(key),
      medianMs: context.medians,
      timeZone: context.timeZone,
      now,
    });
    return {
      user_id: userId,
      concept_id: conceptId,
      mastery: model.mastery,
      retrieval_strength: model.retrievalStrength,
      status: model.status,
      next_difficulty: model.nextDifficulty,
      attempts: model.attempts,
      correct: model.correct,
      incorrect: model.incorrect,
      streak: model.streak,
      open_mistakes: entry.openMistakes,
      misconceptions: model.misconceptions,
      underconfident: model.underconfident,
      avg_confidence: model.avgConfidence,
      avg_response_ms: model.avgResponseMs,
      trend: model.trend,
      last_practiced_at: model.lastPracticedAt,
      next_review_at: model.nextReviewAt,
      p_learned: model.known,
      recall: model.recall,
      elo_rating: clamp(model.rating, -20, 20),
      elo_answers: model.ratingAnswers,
      elo_start: previous?.eloStart ?? (model.ratingAnswers > 0 ? clamp(start, -20, 20) : null),
      weakness: model.weakness,
      first_attempts: model.firstAttempts,
      gates: model.gates,
      next_step: model.nextStep,
      best_status: model.attempts > 0 ? higherState(previous?.bestStatus ?? null, model.status) : (previous?.bestStatus ?? null),
      fsrs_stability: model.fsrs?.stability ?? null,
      fsrs_difficulty: model.fsrs?.difficulty ?? null,
      fsrs_state: model.fsrs?.state ?? null,
      fsrs_reps: model.fsrs?.reps ?? 0,
      fsrs_lapses: model.fsrs?.lapses ?? 0,
      fsrs_last_review: model.fsrs?.lastReview ?? null,
      model_version: ENGINE.modelVersion,
      computed_at: now.toISOString(),
    };
  });
  for (const batch of chunked(rows, 500)) {
    const { error } = await supabase.from("concept_mastery").upsert(batch, { onConflict: "user_id,concept_id" });
    if (error) {
      console.error("concept_mastery: upsert failed", error.message);
      return 0;
    }
  }
  // First-time mastery earns XP (§31); the award key makes a concept count once.
  if (options.awardXp !== false) {
    const mastered = rows.filter((row) => row.status === "mastered").map((row) => row.concept_id);
    if (mastered.length > 0) {
      const { data: names } = await supabase.from("concepts").select("id, name").eq("user_id", userId).in("id", mastered);
      await awardMasteredXp(supabase, (names ?? []).map((concept) => ({ id: concept.id, name: concept.name })));
    }
  }
  return rows.length;
}

/**
 * Recomputes the signed-in student's mastery. Called after quizzes,
 * sessions, reviews and notebook changes; safe to call often.
 */
export async function recomputeMastery(conceptIds: string[] | null = null): Promise<number> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("id").maybeSingle();
  if (!profile) return 0;
  return recomputeMasteryFor(supabase, profile.id, conceptIds);
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
/** The same, joined so that a filter on the concept's material keeps only its rows. */
const MASTERY_COLUMNS_FOR_MATERIAL = "*, concept:concepts!concept_mastery_concept_fk!inner(id, name, material_id, material:materials!concepts_material_fk(id, title))";

/** Recall fades every day: mastery older than this is recomputed on the next read (the nightly job usually gets there first). */
export const MASTERY_STALE_MS = 20 * 60 * 60 * 1000;

/**
 * Once per request: recompute the student's mastery when any practiced
 * concept was last computed before the stale cutoff, or by an older version
 * of the learning engine.
 */
const refreshStaleMastery = cache(async (): Promise<void> => {
  try {
    const supabase = await createClient();
    const cutoff = new Date(Date.now() - MASTERY_STALE_MS).toISOString();
    const { data } = await supabase
      .from("concept_mastery")
      .select("concept_id")
      .gt("attempts", 0)
      .or(`computed_at.lt.${cutoff},model_version.lt.${ENGINE.modelVersion}`)
      .limit(1);
    if (data && data.length > 0) await recomputeMastery(null);
  } catch (error) {
    // Next.js's own signals (such as "this route reads cookies, render it per request") must pass through.
    unstable_rethrow(error);
    console.error("concept_mastery: stale refresh failed", error);
  }
});

/** Enough for any real student; every average, plan and goal is worked out from all of them. */
const MASTERY_ROWS_MAX = 10_000;

export const listMastery = cache(async (filters: { materialId?: string } = {}): Promise<MasteryView[]> => {
  await refreshStaleMastery();
  const supabase = await createClient();
  try {
    // One material's concepts are filtered in the database, so none are lost to a cap on the student's whole list.
    const rows = await readPages(
      (from, to) => {
        const query = filters.materialId
          ? supabase.from("concept_mastery").select(MASTERY_COLUMNS_FOR_MATERIAL).eq("concept.material_id", filters.materialId)
          : supabase.from("concept_mastery").select(MASTERY_COLUMNS);
        return query.order("mastery", { ascending: true }).order("concept_id").range(from, to);
      },
      MASTERY_ROWS_MAX,
    );
    return rows as unknown as MasteryView[];
  } catch (error) {
    unstable_rethrow(error);
    console.error("concept_mastery: list failed", error instanceof Error ? error.message : error);
    return [];
  }
});

export type MasterySummary = {
  total: number;
  /** By state; `weak` is shown as Needs foundation. */
  weak: MasteryView[];
  learning: MasteryView[];
  developing: MasteryView[];
  strong: MasteryView[];
  mastered: MasteryView[];
  /** The weak topics (isWeakTopic), weakest first. */
  needsWork: MasteryView[];
  /** Was strong or mastered and has faded: a quick review brings it back. */
  refresh: MasteryView[];
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
    developing: practiced.filter((row) => row.status === "developing"),
    strong: practiced.filter((row) => row.status === "strong"),
    mastered: practiced.filter((row) => row.status === "mastered"),
    needsWork: practiced
      .filter(isWeakTopic)
      .sort((a, b) => Number(b.weakness) - Number(a.weakness) || Number(a.mastery) - Number(b.mastery)),
    refresh: practiced.filter(needsRefresh).sort((a, b) => Number(a.recall ?? 1) - Number(b.recall ?? 1)),
    dueForReview: practiced.filter((row) => row.next_review_at && row.next_review_at <= now && row.status !== "weak").sort((a, b) => Number(a.retrieval_strength) - Number(b.retrieval_strength)),
    misconceptions: practiced.filter((row) => row.misconceptions > 0).sort((a, b) => b.misconceptions - a.misconceptions),
    underconfident: practiced.filter((row) => row.underconfident > 0).sort((a, b) => b.underconfident - a.underconfident),
    averageMastery: practiced.length ? Math.round(practiced.reduce((sum, row) => sum + Number(row.mastery), 0) / practiced.length) : null,
  };
});

/** Concept names that need work, best signal first (for prompts that focus generation). */
export async function weakConceptNames(materialId: string | null, limit = 6): Promise<string[]> {
  const summary = await getMasterySummary(materialId ? { materialId } : {});
  const ranked = [...summary.needsWork, ...summary.misconceptions, ...summary.learning, ...summary.dueForReview];
  const names: string[] = [];
  for (const row of ranked) {
    const name = row.concept?.name;
    if (name && !names.includes(name)) names.push(name);
    if (names.length >= limit) break;
  }
  return names;
}

/**
 * The difficulty for concepts without a target yet: the label Elo predicts
 * closest to the usual 72% success at the student's overall ability.
 */
export async function defaultDifficulty(): Promise<QuestionDifficulty> {
  const rows = await listMastery();
  const ability = abilityOf(rows.map((row) => ({ elo_rating: Number(row.elo_rating), elo_answers: row.elo_answers })));
  const options = (["easy", "medium", "hard"] as const).map((label) => ({ label, difficulty: labelPrior(label), guessFloor: guessFloor("multiple_choice", null) }));
  const choice = chooseDifficulty(ability, options, ENGINE.elo.target.normal, false);
  return choice.label === "advanced" ? "hard" : choice.label;
}

/** Per-concept target difficulty for adaptive question generation (Elo's pick for each concept). */
export async function difficultyTargets(materialId: string): Promise<Array<{ concept: string; difficulty: "easy" | "medium" | "hard" | "advanced" }>> {
  const rows = await listMastery({ materialId });
  return rows.filter((row) => row.concept && row.attempts > 0).map((row) => ({ concept: row.concept!.name, difficulty: row.next_difficulty }));
}
