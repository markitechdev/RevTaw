/**
 * The one rule from a 0-100 score to what the student is told and what RevTaw records. An answer counts as
 * correct (session counters, the mistake notebook, mastery) exactly when its label is "Correct" or "Mostly
 * right", so the label and the stored result can never disagree. Pure and client-safe: the flows that store
 * answers and the runners that show them both use it.
 */

export type Verdict = "correct" | "mostly" | "partial" | "incorrect";

/** The score an answer needs to count as correct, by kind of exercise. */
export const PASS_SCORE = {
  /** Recall, retrieval, chunking, error review, guided-reading questions, reading summaries. */
  recall: 60,
  /** A Feynman explanation must be clear enough for a beginner, so it needs more. */
  feynman: 70,
  blurt: 60,
  problem: 60,
  case: 60,
  visual: 60,
  /** Lists rebuilt from a mnemonic or a story: most items, in order. */
  list: 80,
} as const;

export type PassKind = keyof typeof PASS_SCORE;

export function verdictFor(score: number, passAt: number = PASS_SCORE.recall): Verdict {
  if (score >= Math.max(80, passAt)) return "correct";
  if (score >= passAt) return "mostly";
  if (score >= passAt / 2) return "partial";
  return "incorrect";
}

export function countsAsCorrect(verdict: Verdict): boolean {
  return verdict === "correct" || verdict === "mostly";
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  correct: "Correct",
  mostly: "Mostly right",
  partial: "Partly there",
  incorrect: "Not yet",
};

/**
 * A scenario counts as correct when the best option was chosen and justified (flows/applied.ts): a right choice
 * with a weak justification is "Partly there", a wrong choice is "Not yet" whatever the reasoning. When the
 * reasoning couldn't be checked (no score), the choice alone decides.
 */
export function scenarioVerdict(result: { isCorrect: boolean; correctChoice: boolean; score: number | null }): Verdict {
  // A null score: the reasoning couldn't be checked, so the choice alone decided.
  if (result.isCorrect) return result.score === null || result.score >= 80 ? "correct" : "mostly";
  return result.correctChoice ? "partial" : "incorrect";
}
