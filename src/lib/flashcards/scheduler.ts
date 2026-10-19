import type { FlashcardRating } from "@/lib/supabase/database.types";

/**
 * Spaced-repetition scheduler: an SM-2 style interval/ease model combined
 * with a five-box Leitner ladder (spec §16 Spaced Repetition + Leitner).
 *
 * - Correct/easy answers lengthen the interval and move the card up a box.
 * - Incorrect answers reset the interval and drop the card to box 1.
 * - Intervals follow the spec's ladder (today, 1, 3, 7, 14, 30 days…) and
 *   grow with the card's ease afterwards.
 */

export type SchedulerState = {
  box: number;
  ease: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
};

export type ScheduledState = SchedulerState & { due_at: string };

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

const MIN_EASE = 1.3;
const MAX_EASE = 4;
const MAX_INTERVAL_DAYS = 365;
const AGAIN_DELAY_MINUTES = 10;

function clampEase(value: number): number {
  return Math.round(Math.max(MIN_EASE, Math.min(MAX_EASE, value)) * 100) / 100;
}

function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

export function schedule(state: SchedulerState, rating: FlashcardRating, now: Date = new Date()): ScheduledState {
  switch (rating) {
    case "again":
      return {
        box: 1,
        ease: clampEase(state.ease - 0.2),
        interval_days: 0,
        repetitions: 0,
        lapses: state.lapses + 1,
        due_at: new Date(now.getTime() + AGAIN_DELAY_MINUTES * 60_000).toISOString(),
      };
    case "hard": {
      const interval = Math.min(MAX_INTERVAL_DAYS, state.interval_days === 0 ? 1 : Math.max(state.interval_days + 1, Math.round(state.interval_days * 1.2)));
      return {
        box: state.box,
        ease: clampEase(state.ease - 0.15),
        interval_days: interval,
        repetitions: state.repetitions + 1,
        lapses: state.lapses,
        due_at: addDays(now, interval).toISOString(),
      };
    }
    case "good": {
      const interval = Math.min(
        MAX_INTERVAL_DAYS,
        state.repetitions === 0 ? 1 : state.repetitions === 1 ? 3 : Math.max(state.interval_days + 1, Math.round(state.interval_days * state.ease)),
      );
      return {
        box: Math.min(5, state.box + 1),
        ease: clampEase(state.ease),
        interval_days: interval,
        repetitions: state.repetitions + 1,
        lapses: state.lapses,
        due_at: addDays(now, interval).toISOString(),
      };
    }
    case "easy": {
      const ease = clampEase(state.ease + 0.15);
      const interval = Math.min(
        MAX_INTERVAL_DAYS,
        state.repetitions === 0 ? 3 : state.repetitions === 1 ? 7 : Math.max(state.interval_days + 2, Math.round(state.interval_days * ease * 1.3)),
      );
      return {
        box: Math.min(5, state.box + 1),
        ease,
        interval_days: interval,
        repetitions: state.repetitions + 1,
        lapses: state.lapses,
        due_at: addDays(now, interval).toISOString(),
      };
    }
  }
}

/** "in 10 min", "tomorrow", "in 3 days" — what each rating button would do. */
export function describeInterval(state: SchedulerState, rating: FlashcardRating): string {
  const next = schedule(state, rating, new Date(0));
  if (rating === "again") return `${AGAIN_DELAY_MINUTES} min`;
  if (next.interval_days === 1) return "1 day";
  if (next.interval_days < 30) return `${next.interval_days} days`;
  const months = Math.round(next.interval_days / 30);
  return months === 1 ? "1 month" : `${months} months`;
}

export function isDue(dueAt: string, now: Date = new Date()): boolean {
  return new Date(dueAt).getTime() <= now.getTime();
}
