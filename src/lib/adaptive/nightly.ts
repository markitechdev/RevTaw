import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MASTERY_STALE_MS, recomputeMasteryFor } from "@/lib/adaptive/engine";
import { chunked, conceptCategories, DEFAULT_CATEGORY, forgetCachedBuckets, optionCount } from "@/lib/adaptive/evidence";
import { guessFloor } from "@/lib/engine/bkt";
import { ENGINE } from "@/lib/engine/config";
import { bucketKey, fitBucketDifficulty, labelPrior, type BucketObservation } from "@/lib/engine/elo";
import { recallAt, type FsrsSnapshot } from "@/lib/engine/fsrs";
import { cardSnapshot } from "@/lib/flashcards/scheduler";
import { addDays, dateIn, daysBetween, DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/planner/dates";
import { zonedInstant } from "@/lib/planner/time";
import type { Database, QuestionDifficulty } from "@/lib/supabase/database.types";
import { readPages, readPagesQuietly } from "@/lib/supabase/paginate";
import { clampTitle } from "@/lib/text/clamp";

/**
 * The learning engine's nightly run (research doc §8–§9), called by
 * /api/cron/engine with the server's secret-key client:
 *
 *   1. Refit the shared item buckets from first attempts across students.
 *   2. Exam boosters: concepts in an exam's materials whose recall would
 *      fall below 90% by exam day get one review task two days before, and
 *      their flashcards come due by then (Cepeda et al. 2008).
 *   3. Recompute stale mastery, so recall keeps fading for students who
 *      haven't opened RevTaw (reads refresh it too).
 *
 * Every per-student query filters by that student's id.
 */

type Client = SupabaseClient<Database>;

const DAY_MS = 86_400_000;
/** Supabase returns at most 1,000 rows per request by default: read in pages. */
const PAGE = 1000;
const BOOSTER_TITLE = "Exam booster: ";

export type NightlyRun = { buckets: number; boosters: number; cardsMoved: number; students: number; concepts: number; failed: number };

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Each student counts with at most this many first attempts (their latest), so no one student outweighs the rest. */
const REFIT_PER_STUDENT = 400;
const REFIT_MAX_ROWS = 20_000;

/**
 * Refits every bucket that has first attempts in the window; thin buckets stay near their label.
 * The attempts come from bucket_first_attempts() (migration 0027): each student's first answer per
 * question, latest 400 per student, none dated after now.
 */
export async function refitItemBuckets(admin: Client, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - ENGINE.buckets.windowDays * DAY_MS).toISOString();
  const answers = await readPages(
    (from, to) => admin.rpc("bucket_first_attempts", { since, per_student: REFIT_PER_STUDENT, max_rows: REFIT_MAX_ROWS }).range(from, to),
    REFIT_MAX_ROWS,
  ).catch((error: unknown) => {
    throw new Error(`item buckets: answers failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (answers.length === 0) return 0;

  const conceptIds = [...new Set(answers.map((row) => row.concept_id))];
  const [categories, ratingPages] = await Promise.all([
    conceptCategories(admin, conceptIds),
    Promise.all(chunked(conceptIds).map((chunk) => admin.from("concept_mastery").select("user_id, concept_id, elo_rating").in("concept_id", chunk))),
  ]);
  // Each student's current rating on the concept stands in for their ability when they answered.
  const ratings = new Map(ratingPages.flatMap((page) => page.data ?? []).map((row) => [`${row.user_id}:${row.concept_id}`, Number(row.elo_rating)]));
  const buckets = new Map<string, { label: QuestionDifficulty; observations: BucketObservation[] }>();
  for (const row of answers) {
    const key = bucketKey(row.difficulty, row.question_type, categories.get(row.concept_id) ?? DEFAULT_CATEGORY);
    const entry = buckets.get(key) ?? { label: row.difficulty, observations: [] };
    entry.observations.push({
      rating: ratings.get(`${row.user_id}:${row.concept_id}`) ?? 0,
      correct: row.is_correct,
      guessFloor: guessFloor(row.question_type, optionCount(row.options)),
    });
    buckets.set(key, entry);
  }
  const rows = [...buckets].map(([key, entry]) => ({
    bucket_key: key,
    difficulty: round3(fitBucketDifficulty(entry.observations, labelPrior(entry.label))),
    answers: entry.observations.length,
    refit_at: now.toISOString(),
  }));
  const { error } = await admin.from("item_buckets").upsert(rows, { onConflict: "bucket_key" });
  if (error) throw new Error(`item buckets: upsert failed: ${error.message}`);
  // The rest of this run (and this instance's next graded answers) use the new difficulties.
  forgetCachedBuckets();
  return rows.length;
}

type ScopedConcept = {
  concept_id: string;
  fsrs_stability: number | null;
  fsrs_difficulty: number | null;
  fsrs_state: number | null;
  fsrs_reps: number;
  fsrs_lapses: number;
  fsrs_last_review: string | null;
  next_review_at: string | null;
  concept: { name: string; material_id: string | null } | null;
};

function conceptSnapshot(row: ScopedConcept): FsrsSnapshot | null {
  if (row.fsrs_stability === null || row.fsrs_difficulty === null || row.fsrs_state === null || !row.fsrs_last_review) return null;
  return {
    stability: Number(row.fsrs_stability),
    difficulty: Number(row.fsrs_difficulty),
    state: row.fsrs_state,
    reps: row.fsrs_reps,
    lapses: row.fsrs_lapses,
    learningSteps: 0,
    scheduledDays: 0,
    lastReview: row.fsrs_last_review,
    due: row.next_review_at ?? row.fsrs_last_review,
  };
}

/**
 * One exam's booster: per material, a review task on the booster day for
 * the concepts whose recall would be under 90% on exam morning (weakest
 * first, at most eight), and those materials' fading flashcards due by then.
 * Re-running updates a pending booster instead of adding another; a booster
 * the student finished or skipped is left alone.
 */
async function boostExam(
  admin: Client,
  exam: { id: string; user_id: string; title: string; exam_date: string },
  timeZone: string,
  now: Date,
): Promise<{ boosters: number; cardsMoved: number }> {
  const { horizonDays, daysBefore, recallBelow, maxConcepts } = ENGINE.booster;
  const today = dateIn(now, timeZone);
  const daysLeft = daysBetween(today, exam.exam_date);
  if (daysLeft < 0 || daysLeft > horizonDays) return { boosters: 0, cardsMoved: 0 };
  const boostOn = daysLeft > daysBefore ? addDays(exam.exam_date, -daysBefore) : today;
  const examMorning = zonedInstant(exam.exam_date, "08:00", timeZone);

  const { data: links } = await admin.from("exam_materials").select("material_id").eq("exam_id", exam.id).eq("user_id", exam.user_id);
  const materialIds = (links ?? []).map((row) => row.material_id);
  if (materialIds.length === 0) return { boosters: 0, cardsMoved: 0 };

  const { data: scoped } = await admin
    .from("concept_mastery")
    .select("concept_id, fsrs_stability, fsrs_difficulty, fsrs_state, fsrs_reps, fsrs_lapses, fsrs_last_review, next_review_at, concept:concepts!concept_mastery_concept_fk!inner(name, material_id)")
    .eq("user_id", exam.user_id)
    .gt("attempts", 0)
    .in("concept.material_id", materialIds)
    .limit(1000);
  const fading = ((scoped ?? []) as unknown as ScopedConcept[])
    .map((row) => ({ row, recall: recallAt(conceptSnapshot(row), examMorning) }))
    .filter((entry): entry is { row: ScopedConcept; recall: number } => entry.recall !== null && entry.recall < recallBelow && Boolean(entry.row.concept?.material_id))
    .sort((a, b) => a.recall - b.recall)
    .slice(0, maxConcepts);

  let boosters = 0;
  const byMaterial = new Map<string, string[]>();
  for (const { row } of fading) byMaterial.set(row.concept!.material_id!, [...(byMaterial.get(row.concept!.material_id!) ?? []), row.concept!.name]);
  for (const [materialId, names] of byMaterial) {
    const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? ` and ${names.length - 3} more` : "");
    const task = {
      title: clampTitle(`${BOOSTER_TITLE}${exam.title}`),
      reason: `${shown} would be under 90% recall by exam day. One review ${daysBefore} days before brings ${names.length === 1 ? "it" : "them"} back up.`,
      scheduled_for: boostOn,
      minutes: Math.min(20, 8 + 2 * names.length),
      concepts: names,
    };
    const { data: existing } = await admin
      .from("study_tasks")
      .select("id, status")
      .eq("user_id", exam.user_id)
      .eq("exam_id", exam.id)
      .eq("material_id", materialId)
      .eq("kind", "review")
      .like("title", `${BOOSTER_TITLE}%`)
      .limit(1)
      .maybeSingle();
    if (existing) {
      if (existing.status !== "pending") continue;
      const { error } = await admin.from("study_tasks").update(task).eq("id", existing.id).eq("user_id", exam.user_id);
      if (!error) boosters += 1;
      continue;
    }
    const { error } = await admin
      .from("study_tasks")
      .insert({ ...task, user_id: exam.user_id, exam_id: exam.id, material_id: materialId, kind: "review", method: "review", position: 85 });
    if (error) console.error("engine: booster task failed", error.message);
    else boosters += 1;
  }

  // Flashcards from the exam's materials that would fade below 90% by exam morning come due on the booster day.
  const boostAt = zonedInstant(boostOn, "06:00", timeZone);
  const dueBy = boostAt < now ? now : boostAt;
  const cards = await readPagesQuietly(
    "engine: booster cards",
    (from, to) =>
      admin
        .from("flashcards")
        .select("id, due_at, repetitions, lapses, last_reviewed_at, fsrs_stability, fsrs_difficulty, fsrs_state, fsrs_learning_steps, fsrs_scheduled_days, deck:flashcard_decks!flashcards_deck_fk!inner(material_id)")
        .eq("user_id", exam.user_id)
        .eq("suspended", false)
        .gt("due_at", dueBy.toISOString())
        .in("deck.material_id", materialIds)
        .order("id")
        .range(from, to),
    2000,
  );
  const moving = cards.filter((card) => {
    const recall = recallAt(cardSnapshot(card), examMorning);
    return recall !== null && recall < recallBelow;
  });
  let cardsMoved = 0;
  for (const chunk of chunked(moving.map((card) => card.id))) {
    const { error } = await admin.from("flashcards").update({ due_at: dueBy.toISOString() }).eq("user_id", exam.user_id).in("id", chunk);
    if (!error) cardsMoved += chunk.length;
  }
  return { boosters, cardsMoved };
}

export async function boostExams(admin: Client, now: Date = new Date(), deadline = Number.POSITIVE_INFINITY): Promise<{ boosters: number; cardsMoved: number; failed: number }> {
  const result = { boosters: 0, cardsMoved: 0, failed: 0 };
  // Exam dates are local dates: widen the window by a day on each side, then check per time zone.
  const from = new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + (ENGINE.booster.horizonDays + 1) * DAY_MS).toISOString().slice(0, 10);
  const { data: exams, error } = await admin.from("exams").select("id, user_id, title, exam_date").is("archived_at", null).gte("exam_date", from).lte("exam_date", to).order("exam_date").limit(PAGE);
  if (error) throw new Error(`engine: exams failed: ${error.message}`);
  const userIds = [...new Set((exams ?? []).map((exam) => exam.user_id))];
  const zones = new Map<string, string>();
  for (const chunk of chunked(userIds)) {
    const { data: profiles } = await admin.from("profiles").select("id, timezone").in("id", chunk);
    for (const profile of profiles ?? []) zones.set(profile.id, isValidTimezone(profile.timezone) ? profile.timezone : DEFAULT_TIMEZONE);
  }
  for (const exam of exams ?? []) {
    if (Date.now() > deadline) break;
    try {
      const boosted = await boostExam(admin, exam, zones.get(exam.user_id) ?? DEFAULT_TIMEZONE, now);
      result.boosters += boosted.boosters;
      result.cardsMoved += boosted.cardsMoved;
    } catch (boostError) {
      result.failed += 1;
      console.error(`engine: booster for exam ${exam.id} failed`, boostError);
    }
  }
  return result;
}

/** Students with mastery computed before the stale cutoff, oldest first. */
async function staleStudents(admin: Client, now: Date): Promise<string[]> {
  const cutoff = new Date(now.getTime() - MASTERY_STALE_MS).toISOString();
  const { data } = await admin.from("concept_mastery").select("user_id").gt("attempts", 0).lt("computed_at", cutoff).order("computed_at", { ascending: true }).limit(PAGE);
  return [...new Set((data ?? []).map((row) => row.user_id))];
}

export async function runNightlyEngine(admin: Client, options: { now?: Date; budgetMs?: number } = {}): Promise<NightlyRun> {
  const now = options.now ?? new Date();
  const deadline = Date.now() + (options.budgetMs ?? 50_000);
  const run: NightlyRun = { buckets: 0, boosters: 0, cardsMoved: 0, students: 0, concepts: 0, failed: 0 };
  try {
    run.buckets = await refitItemBuckets(admin, now);
  } catch (error) {
    run.failed += 1;
    console.error("engine: bucket refit failed", error);
  }
  const boosted = await boostExams(admin, now, deadline);
  run.boosters = boosted.boosters;
  run.cardsMoved = boosted.cardsMoved;
  run.failed += boosted.failed;
  for (const userId of await staleStudents(admin, now)) {
    if (Date.now() > deadline) break;
    try {
      run.concepts += await recomputeMasteryFor(admin, userId, null, { now, awardXp: false });
      run.students += 1;
    } catch (error) {
      run.failed += 1;
      console.error(`engine: recompute for ${userId} failed`, error);
    }
  }
  return run;
}
