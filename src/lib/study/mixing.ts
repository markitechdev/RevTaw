/**
 * How a session mixes prompts from several materials (cumulative review). Pure and client-safe.
 */

export const CUMULATIVE_SPLIT = [0.6, 0.2, 0.1, 0.1] as const;

/**
 * Prompts per material for a cumulative review: the current lesson gets its 60% (rounded up), the older
 * lessons share the rest by their weights (largest remainder, so the counts add up to `total`).
 */
export function cumulativeCounts(total: number, olderLessons: number): number[] {
  const older = Math.max(0, Math.min(CUMULATIVE_SPLIT.length - 1, olderLessons));
  if (older === 0) return [total];
  const current = Math.min(total - 1, Math.max(1, Math.ceil(total * CUMULATIVE_SPLIT[0])));
  const rest = total - current;
  const weights = CUMULATIVE_SPLIT.slice(1, 1 + older);
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const exact = weights.map((weight) => (rest * weight) / sum);
  const counts = exact.map((value) => Math.floor(value));
  let left = rest - counts.reduce((acc, count) => acc + count, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - counts[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    counts[index] += 1;
    left -= 1;
  }
  return [current, ...counts];
}

/** Spreads each list's items evenly through one sequence (the first list wins ties), so older lessons are woven in. */
export function weave<T>(lists: T[][]): T[] {
  const keyed = lists.flatMap((list, listIndex) => list.map((item, index) => ({ item, listIndex, key: (index + 0.5) / list.length })));
  return keyed.sort((a, b) => a.key - b.key || a.listIndex - b.listIndex).map((entry) => entry.item);
}
