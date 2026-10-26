/**
 * The share of a long material that was read, as a whole percent for the student. Rounded down, and never
 * 100 while something was left out: 99.6% read is "the first 99%", not "the first 100%". Pure and client-safe.
 */
export function percentRead(ratio: number): number {
  if (!(ratio < 1)) return 100;
  return Math.max(0, Math.min(99, Math.floor(ratio * 100)));
}
