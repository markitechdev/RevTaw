import { ENGINE } from "@/lib/engine/config";
import type { NextDifficulty, QuestionDifficulty } from "@/lib/supabase/database.types";

/**
 * Elo as an online Rasch model (research doc §8; Pelánek 2016): a rating
 * per student and concept, and a difficulty per bucket of questions
 * (difficulty label × question type × concept category), on one logit
 * scale. Most RevTaw questions belong to one student and are answered once,
 * so difficulty is pooled in buckets and refit nightly across all students.
 * Pure.
 */

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** K(n) = max(0.2, 1 / (1 + 0.05 n)): large for new students and concepts, never frozen. */
export function kFactor(answers: number): number {
  return Math.max(ENGINE.elo.kFloor, 1 / (1 + ENGINE.elo.kSlope * Math.max(0, answers)));
}

/** P(right) = c + (1 − c) σ(rating − difficulty), with c the guessing floor. */
export function successProbability(rating: number, difficulty: number, guessFloor = 0): number {
  const c = Math.min(0.99, Math.max(0, guessFloor));
  return c + (1 - c) * sigmoid(rating - difficulty);
}

/** One rating step toward the result (r = 1 right, 0 wrong), scaled by the answer's weight. */
export function eloStep(rating: number, answers: number, correct: boolean, probability: number, weight = 1): number {
  return rating + kFactor(answers) * Math.min(1, Math.max(0, weight)) * ((correct ? 1 : 0) - probability);
}

export function bucketKey(label: QuestionDifficulty, questionType: string, category: string): string {
  return `${label}:${questionType}:${category}`;
}

/** The generator's label as a weak prior: −1, 0 and +1 logits. */
export function labelPrior(label: QuestionDifficulty | null | undefined): number {
  return ENGINE.elo.labelPrior[label ?? "medium"];
}

export type TargetContext = { status: string; attempts: number; missesInARow: number };

/** Target success for the next question: rebuild footing, normal practice, or stretch. */
export function targetSuccess(context: TargetContext): number {
  const { target } = ENGINE.elo;
  if (context.attempts === 0 || context.status === "weak" || context.missesInARow >= 2) return target.foundation;
  if (context.status === "strong" || context.status === "mastered") return target.stretch;
  return target.normal;
}

export type DifficultyOption = { label: QuestionDifficulty; difficulty: number; guessFloor: number };

/**
 * The difficulty label whose predicted success is closest to the target.
 * "Advanced" is a stretch beyond hard, for students who would still get
 * hard items right well above the target.
 */
export function chooseDifficulty(rating: number, options: DifficultyOption[], target: number, allowAdvanced: boolean): { label: NextDifficulty; predicted: number } {
  let best: { label: NextDifficulty; predicted: number; gap: number } | null = null;
  for (const option of options) {
    const predicted = successProbability(rating, option.difficulty, option.guessFloor);
    const gap = Math.abs(predicted - target);
    if (!best || gap < best.gap - 1e-9) best = { label: option.label, predicted, gap };
  }
  if (!best) return { label: "medium", predicted: 0.5 };
  const hard = options.find((option) => option.label === "hard");
  if (allowAdvanced && best.label === "hard" && hard) {
    const predicted = successProbability(rating, hard.difficulty, hard.guessFloor);
    if (predicted >= target + ENGINE.elo.advancedMargin) return { label: "advanced", predicted };
  }
  return { label: best.label, predicted: best.predicted };
}

export type BucketObservation = { rating: number; correct: boolean; guessFloor: number };

/**
 * Refits one bucket's difficulty from first attempts across all students:
 * the maximum of the Rasch log-likelihood plus a normal prior at the label's
 * logit worth `priorWeight` answers (so a thin bucket stays near its label).
 * Newton steps on a concave objective; clamped to ±range.
 */
export function fitBucketDifficulty(observations: BucketObservation[], prior: number, priorWeight: number = ENGINE.buckets.priorWeight): number {
  const range = ENGINE.buckets.range;
  // A normal prior with variance 1/priorWeight·4 ≈ the information of priorWeight answers at p = 0.5.
  const priorPrecision = priorWeight / 4;
  let d = prior;
  for (let iteration = 0; iteration < 50; iteration += 1) {
    let gradient = -priorPrecision * (d - prior);
    let curvature = -priorPrecision;
    for (const { rating, correct, guessFloor } of observations) {
      const c = Math.min(0.99, Math.max(0, guessFloor));
      const s = sigmoid(rating - d);
      const p = c + (1 - c) * s;
      // d/dd of log p (right) or log(1 − p) (wrong); dp/dd = −(1 − c) s (1 − s).
      const dp = -(1 - c) * s * (1 - s);
      const y = correct ? 1 : 0;
      gradient += ((y - p) / (p * (1 - p))) * dp;
      // Fisher information as the curvature (always negative): stable steps.
      curvature -= (dp * dp) / (p * (1 - p));
    }
    const step = gradient / curvature;
    d -= step;
    d = Math.max(-range, Math.min(range, d));
    if (Math.abs(step) < 1e-6) break;
  }
  return d;
}
