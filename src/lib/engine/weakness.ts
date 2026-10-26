import { ENGINE } from "@/lib/engine/config";

/**
 * Weakness score (research doc §6): a topic is weak when there is enough
 * evidence that the student doesn't know it, holds a wrong idea about it or
 * keeps missing it. Every term can be shown to the student. Pure.
 *
 *   W = n / (n + 3) × [0.60 (1 − K) + 0.25 c + 0.15 r]
 */

export type WeaknessInput = {
  /** First-attempt answers on the concept. */
  firstAttempts: number;
  /** K, the share of the concept known, without the recall factor (forgetting enters plans separately). */
  known: number;
  /** Share of the last 30 days' wrong answers that were confident and are still open. */
  confidentShare: number;
  /** Share of the last 30 days' first tries that went wrong, while one of those mistakes is still open, else 0. */
  repeated: number;
};

export function weaknessScore(input: WeaknessInput): number {
  const { shrink, weights } = ENGINE.weakness;
  const n = Math.max(0, input.firstAttempts);
  if (n === 0) return 0;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const raw = weights.gap * (1 - clamp(input.known)) + weights.confident * clamp(input.confidentShare) + weights.repeated * clamp(input.repeated);
  return (n / (n + shrink)) * raw;
}

export function isWeak(score: number): boolean {
  return score >= ENGINE.weakness.flagAt;
}

/**
 * r: how often it has been going wrong lately (misses ÷ first tries in the window) while a mistake is still
 * open. A share rather than a count, so 3 misses in 20 tries don't weigh like 3 in 3.
 */
export function repeatedMisses(missesInWindow: number, answersInWindow: number, openMistakes: number): number {
  if (openMistakes <= 0 || answersInWindow <= 0) return 0;
  return Math.min(1, Math.max(0, missesInWindow) / answersInWindow);
}
