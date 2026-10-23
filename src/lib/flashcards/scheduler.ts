import { describeWait, leitnerBox, preview, recallAt, replay, review, type FsrsSnapshot, type GradedReview } from "@/lib/engine/fsrs";
import type { Flashcard, FlashcardRating } from "@/lib/supabase/database.types";

/**
 * Flashcard scheduling with FSRS-6 (research doc §9): each card keeps its
 * stability and difficulty, a rating moves them, and the card comes back
 * when its recall is predicted to fall to 90%. New cards take short
 * learning steps (1–10 minutes) before their first interval in days. The
 * Leitner box is derived from stability, so the five boxes still read the
 * same. Cards scheduled before FSRS are rebuilt from their review history.
 */

export type CardSchedule = Pick<
  Flashcard,
  "fsrs_stability" | "fsrs_difficulty" | "fsrs_state" | "fsrs_learning_steps" | "fsrs_scheduled_days" | "repetitions" | "lapses" | "last_reviewed_at" | "due_at"
>;

/** The stored FSRS state, or null before the card's first FSRS review. */
export function cardSnapshot(card: CardSchedule): FsrsSnapshot | null {
  if (card.fsrs_stability === null || card.fsrs_difficulty === null || card.fsrs_state === null) return null;
  return {
    stability: Number(card.fsrs_stability),
    difficulty: Number(card.fsrs_difficulty),
    state: card.fsrs_state,
    reps: card.repetitions,
    lapses: card.lapses,
    learningSteps: card.fsrs_learning_steps,
    scheduledDays: card.fsrs_scheduled_days,
    lastReview: card.last_reviewed_at,
    due: card.due_at,
  };
}

/** The card's state now: stored, or replayed from its review history (oldest first); null for a new card. */
export function currentSnapshot(card: CardSchedule, history: GradedReview[]): FsrsSnapshot | null {
  return cardSnapshot(card) ?? (history.length > 0 ? replay(history, "card") : null);
}

export type ScheduledCard = {
  snapshot: FsrsSnapshot;
  box: number;
  intervalDays: number;
  dueAt: string;
  /** Predicted recall just before this review (null for a new card). */
  recallBefore: number | null;
};

export function scheduleCard(before: FsrsSnapshot | null, rating: FlashcardRating, now: Date = new Date()): ScheduledCard {
  const snapshot = review(before, rating, now, "card");
  return { snapshot, box: leitnerBox(snapshot), intervalDays: snapshot.scheduledDays, dueAt: snapshot.due, recallBefore: before ? recallAt(before, now) : null };
}

/** "1 min", "10 min", "2 days" — when each rating would bring the card back. */
export function ratingWaits(snapshot: FsrsSnapshot | null, now: Date = new Date()): Record<FlashcardRating, string> {
  const due = preview(snapshot, now);
  return { again: describeWait(due.again, now), hard: describeWait(due.hard, now), good: describeWait(due.good, now), easy: describeWait(due.easy, now) };
}

/** The columns a review writes on the card. */
export function scheduleColumns(next: ScheduledCard) {
  const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
  return {
    box: next.box,
    interval_days: next.intervalDays,
    repetitions: next.snapshot.reps,
    lapses: next.snapshot.lapses,
    due_at: next.dueAt,
    fsrs_stability: round4(next.snapshot.stability),
    fsrs_difficulty: round4(next.snapshot.difficulty),
    fsrs_state: next.snapshot.state,
    fsrs_learning_steps: next.snapshot.learningSteps,
    fsrs_scheduled_days: next.snapshot.scheduledDays,
  };
}
