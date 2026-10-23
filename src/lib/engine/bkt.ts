import { ENGINE } from "@/lib/engine/config";
import type { QuestionDifficulty } from "@/lib/supabase/database.types";

/**
 * Bayesian Knowledge Tracing (research doc §7): the probability that the
 * student has learned a concept, updated by every answer. Guess and slip
 * come from the question (options, difficulty) instead of being fitted per
 * concept; fitting waits for enough students (pyBKT, Phase 3). Pure.
 */

export type BktParams = { guess: number; slip: number; learn: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Types the student types or writes, where a lucky guess is unlikely. */
const OPTION_TYPES = new Set(["multiple_choice", "true_false"]);

/** G: 1/k for k-option multiple choice, 0.5 for true/false, small for typed and open answers. */
export function guessFor(questionType: string | null | undefined, optionCount: number | null | undefined): number {
  if (questionType === "true_false") return ENGINE.bkt.guessTrueFalse;
  if (questionType === "multiple_choice") {
    const k = optionCount && optionCount >= 2 ? optionCount : ENGINE.bkt.defaultOptionCount;
    return 1 / k;
  }
  return ENGINE.bkt.guessTyped;
}

/** The guessing floor for Elo: 1/k when the student picks among k options, otherwise 0. */
export function guessFloor(questionType: string | null | undefined, optionCount: number | null | undefined): number {
  return questionType && OPTION_TYPES.has(questionType) ? guessFor(questionType, optionCount) : 0;
}

export function slipFor(difficulty: QuestionDifficulty | null | undefined): number {
  return ENGINE.bkt.slip[difficulty ?? "medium"];
}

export function paramsFor(questionType: string | null | undefined, optionCount: number | null | undefined, difficulty: QuestionDifficulty | null | undefined): BktParams {
  return { guess: guessFor(questionType, optionCount), slip: slipFor(difficulty), learn: ENGINE.bkt.learn };
}

/**
 * One BKT step: condition on the answer, then apply the learning step. An
 * answer with weight w below 1 applies that share of the whole update, so
 * quarter-weight wrong guesses nudge P(L) down instead of up.
 */
export function bktUpdate(pLearned: number, correct: boolean, params: BktParams, weight = 1): number {
  const p = clamp01(pLearned);
  const { guess: g, slip: s, learn: t } = params;
  const posterior = correct ? (p * (1 - s)) / (p * (1 - s) + (1 - p) * g) : (p * s) / (p * s + (1 - p) * (1 - g));
  const learned = posterior + (1 - posterior) * t;
  const w = clamp01(weight);
  return clamp01(p + w * (learned - p));
}

/** Predicted chance of a correct answer: P(L)·R·(1 − S) + (1 − P(L)·R)·G (for calibration checks). */
export function predictedCorrect(pLearned: number, recall: number, params: Pick<BktParams, "guess" | "slip">): number {
  const known = clamp01(pLearned) * clamp01(recall);
  return known * (1 - params.slip) + (1 - known) * params.guess;
}
