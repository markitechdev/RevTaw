import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type FSRS, type Grade } from "ts-fsrs";

import type { AnswerGrade } from "@/lib/engine/answers";
import { ENGINE } from "@/lib/engine/config";
import type { FlashcardRating } from "@/lib/supabase/database.types";

/**
 * FSRS-6 through ts-fsrs (research doc §9): the scheduler for flashcards
 * and, once a day, for concepts. Default parameters and desired retention
 * 0.90 until a student has enough reviews for the optimizer (Phase 2).
 * Fuzz stays off so a replayed history always lands on the same state.
 * Pure and client-safe.
 */

export { State as FsrsState };

/** What RevTaw stores of an FSRS card (flashcards and concept_mastery columns). */
export type FsrsSnapshot = {
  stability: number;
  difficulty: number;
  state: State;
  reps: number;
  lapses: number;
  learningSteps: number;
  scheduledDays: number;
  lastReview: string | null;
  due: string;
};

const schedulers = new Map<string, FSRS>();

/**
 * Cards keep FSRS's learning steps (minutes apart on the first day);
 * concepts are reviewed once a day, so they skip them.
 */
export function scheduler(kind: "card" | "concept", retention: number = ENGINE.fsrs.retention): FSRS {
  const key = `${kind}:${retention}`;
  let instance = schedulers.get(key);
  if (!instance) {
    instance = fsrs(generatorParameters({ request_retention: retention, enable_fuzz: false, enable_short_term: kind === "card" }));
    schedulers.set(key, instance);
  }
  return instance;
}

const GRADE: Record<FlashcardRating | AnswerGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export function gradeOf(rating: FlashcardRating | AnswerGrade): Grade {
  return GRADE[rating];
}

export function toSnapshot(card: Card): FsrsSnapshot {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    reps: card.reps,
    lapses: card.lapses,
    learningSteps: card.learning_steps,
    scheduledDays: card.scheduled_days,
    lastReview: card.last_review ? card.last_review.toISOString() : null,
    due: card.due.toISOString(),
  };
}

export function toCard(snapshot: FsrsSnapshot): Card {
  return {
    due: new Date(snapshot.due),
    stability: snapshot.stability,
    difficulty: snapshot.difficulty,
    elapsed_days: 0,
    scheduled_days: snapshot.scheduledDays,
    learning_steps: snapshot.learningSteps,
    reps: snapshot.reps,
    lapses: snapshot.lapses,
    state: snapshot.state,
    last_review: snapshot.lastReview ? new Date(snapshot.lastReview) : undefined,
  };
}

export type GradedReview = { at: string | Date; rating: FlashcardRating | AnswerGrade };

/** Rebuilds a state from its review history, oldest first (the migration from SM-2 needs nothing else). */
export function replay(reviews: GradedReview[], kind: "card" | "concept", retention?: number): FsrsSnapshot | null {
  const ordered = [...reviews].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  if (ordered.length === 0) return null;
  const f = scheduler(kind, retention);
  let card = createEmptyCard(new Date(ordered[0].at));
  for (const review of ordered) {
    card = f.next(card, new Date(review.at), gradeOf(review.rating)).card;
  }
  return toSnapshot(card);
}

/** Applies one rating now: the state before is the stored snapshot, or a new card. */
export function review(snapshot: FsrsSnapshot | null, rating: FlashcardRating | AnswerGrade, now: Date, kind: "card" | "concept" = "card", retention?: number): FsrsSnapshot {
  const f = scheduler(kind, retention);
  const card = snapshot ? toCard(snapshot) : createEmptyCard(now);
  return toSnapshot(f.next(card, now, gradeOf(rating)).card);
}

/** When each rating would bring the card back (for the buttons' hints). */
export function preview(snapshot: FsrsSnapshot | null, now: Date, retention?: number): Record<FlashcardRating, Date> {
  const f = scheduler("card", retention);
  const card = snapshot ? toCard(snapshot) : createEmptyCard(now);
  const options = f.repeat(card, now);
  return {
    again: options[Rating.Again].card.due,
    hard: options[Rating.Hard].card.due,
    good: options[Rating.Good].card.due,
    easy: options[Rating.Easy].card.due,
  };
}

/**
 * Probability of recalling it at `at` (1 when it was just reviewed; null before any review), on FSRS-6's
 * forgetting curve with the time elapsed in fractional days: ts-fsrs's own reading counts whole days, so
 * recall would stay at 1 for the first 24 hours and then drop in steps.
 */
export function recallAt(snapshot: FsrsSnapshot | null, at: Date): number | null {
  if (!snapshot || !snapshot.lastReview || snapshot.state === State.New) return null;
  const elapsedDays = Math.max(0, (at.getTime() - new Date(snapshot.lastReview).getTime()) / 86_400_000);
  return scheduler("concept").forgetting_curve(elapsedDays, snapshot.stability);
}

/** Leitner view of FSRS (§9): box 1 under 1 day of stability … box 5 beyond 21 days. */
export function leitnerBox(snapshot: FsrsSnapshot | null): number {
  if (!snapshot || snapshot.state === State.New) return 1;
  const [one, two, three, four] = ENGINE.fsrs.leitnerDays;
  const s = snapshot.stability;
  if (s < one) return 1;
  if (s < two) return 2;
  if (s < three) return 3;
  if (s < four) return 4;
  return 5;
}

/** "1 min", "10 min", "1 day", "3 days", "2 months" — how far away a due date is. */
export function describeWait(due: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((due.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.round(minutes / 1440);
  if (days < 30) return days === 1 ? "1 day" : `${days} days`;
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? "1 month" : `${months} months`;
  const years = Math.round(days / 365);
  return years === 1 ? "1 year" : `${years} years`;
}
