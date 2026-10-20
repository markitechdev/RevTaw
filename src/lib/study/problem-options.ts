/** Practice-problem difficulty levels (spec §16), shared by the builder and the server. */
export const PROBLEM_DIFFICULTIES = ["easy", "medium", "hard", "challenge"] as const;
export type ProblemDifficulty = (typeof PROBLEM_DIFFICULTIES)[number];

export const PROBLEM_DIFFICULTY_LABEL: Record<ProblemDifficulty | "adaptive", string> = {
  adaptive: "Adaptive",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  challenge: "Challenge",
};

export type SolutionView = {
  steps: Array<{ step: string; explanation: string }>;
  final_answer: string;
  alternative_approach: string | null;
};

/** Reads a stored reference solution (JSON in `model_answer`) for display. */
export function readSolution(value: string | null): SolutionView | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SolutionView>;
    if (!Array.isArray(parsed.steps) || typeof parsed.final_answer !== "string") return null;
    return {
      steps: parsed.steps.filter((step) => step && typeof step.step === "string").map((step) => ({ step: step.step, explanation: typeof step.explanation === "string" ? step.explanation : "" })),
      final_answer: parsed.final_answer,
      alternative_approach: typeof parsed.alternative_approach === "string" ? parsed.alternative_approach : null,
    };
  } catch {
    return null;
  }
}

/** Label of a faded example's level: "90% solved" … "On your own". */
export function fadeLabel(format: string | null): string | null {
  if (!format) return null;
  if (format === "independent") return "On your own";
  const match = format.match(/^faded_(\d+)$/);
  return match ? `${match[1]}% solved` : null;
}

/** Spec: example 1 — 90% completed, 2 — 70%, 3 — 40%, 4 — independent. */
export const FADE_LEVELS = [0.9, 0.7, 0.4, 0] as const;

export function fadeFormat(level: number): string {
  return level <= 0 ? "independent" : `faded_${Math.round(level * 100)}`;
}

/** Fade levels for a set of n problems: always ends with an independent problem. */
export function fadeSchedule(count: number): number[] {
  if (count >= FADE_LEVELS.length) return [...FADE_LEVELS, ...Array.from({ length: count - FADE_LEVELS.length }, () => 0)];
  if (count === 3) return [0.9, 0.4, 0];
  if (count === 2) return [0.9, 0];
  return [0];
}

/**
 * How many steps to give away: about `level` of the solution, always leaving
 * the student at least one step, and strictly less help than the previous
 * example (`previousShare` = steps given / steps of the previous example).
 */
export function givenStepCount(totalSteps: number, level: number, previousShare = 1): number {
  if (level <= 0 || totalSteps <= 1) return 0;
  let given = Math.min(totalSteps - 1, Math.round(totalSteps * level));
  while (given > 0 && given / totalSteps >= previousShare) given -= 1;
  return given;
}
