import type { FlashcardRating } from "@/lib/supabase/database.types";

/** Client-safe flashcard labels; scheduling itself lives on the server (scheduler.ts, FSRS). */

/** Leitner boxes are a view of FSRS stability: 1 under a day … 5 beyond three weeks. */
export const BOX_LABELS: Record<number, string> = {
  1: "Difficult",
  2: "Learning",
  3: "Familiar",
  4: "Strong",
  5: "Mastered",
};

export const RATING_LABELS: Record<FlashcardRating, { label: string; hint: string }> = {
  again: { label: "Don't know", hint: "Show again soon" },
  hard: { label: "Hard", hint: "Recalled with effort" },
  good: { label: "Medium", hint: "Recalled correctly" },
  easy: { label: "Easy", hint: "Knew it instantly" },
};

/** A card due again within this many minutes comes back later in the same review (FSRS learning steps). */
export const REPEAT_WITHIN_MINUTES = 20;

export function isDue(dueAt: string, now: Date = new Date()): boolean {
  return new Date(dueAt).getTime() <= now.getTime();
}
