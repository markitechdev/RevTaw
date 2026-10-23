import { ENGINE } from "@/lib/engine/config";
import type { ConfidenceLevel } from "@/lib/supabase/database.types";

/**
 * How RevTaw reads one answer (research doc §6): correctness, the student's
 * confidence and the response time together say whether it shows a
 * misconception, a gap, a rapid guess, a fragile success or real knowledge.
 * The reading sets how much the answer moves the estimates and which grade
 * spaced repetition gets. Pure and client-safe.
 */

export type AnswerReading = "misconception" | "gap" | "rapid_guess" | "fragile" | "known";

/** FSRS grades an answer can map to (Easy comes only from self-rated flashcards). */
export type AnswerGrade = "again" | "hard" | "good";

export type ReadAnswerInput = {
  correct: boolean;
  confidence: ConfidenceLevel | null | undefined;
  responseMs: number | null | undefined;
  /** The student's median time for this kind of question, when there are enough timed answers. */
  medianMs?: number | null;
};

export type ReadAnswer = { reading: AnswerReading; weight: number; grade: AnswerGrade };

const CONFIDENT: ReadonlySet<ConfidenceLevel> = new Set(["somewhat_confident", "very_confident"]);

export function isConfident(confidence: ConfidenceLevel | null | undefined): boolean {
  return Boolean(confidence && CONFIDENT.has(confidence));
}

export function isRapidGuess(responseMs: number | null | undefined, medianMs: number | null | undefined): boolean {
  if (!responseMs || responseMs <= 0 || !medianMs || medianMs <= 0) return false;
  return responseMs < ENGINE.answers.rapidGuessShare * medianMs;
}

export function readAnswer(input: ReadAnswerInput): ReadAnswer {
  const { weight } = ENGINE.answers;
  if (isRapidGuess(input.responseMs, input.medianMs)) {
    return { reading: "rapid_guess", weight: weight.rapidGuess, grade: input.correct ? "hard" : "again" };
  }
  if (!input.correct) {
    return isConfident(input.confidence) ? { reading: "misconception", weight: weight.full, grade: "again" } : { reading: "gap", weight: weight.full, grade: "again" };
  }
  // Right but guessing or unsure: count half and ask again later. No confidence given reads as known.
  if (input.confidence === "guessing" || input.confidence === "unsure") return { reading: "fragile", weight: weight.fragile, grade: "hard" };
  return { reading: "known", weight: weight.full, grade: "good" };
}

/** Median of the positive values, or null with fewer than `min` of them. */
export function median(values: number[], min: number = ENGINE.answers.minTimedAnswers): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length < min) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
