/**
 * Titles and short texts built from other titles ("<material> — Quiz",
 * "Review: <material>") must still fit their columns: most titles allow 1–160
 * characters, exams, routines and palaces 120. Lengths are counted as Postgres
 * counts them (characters, not UTF-16 units), so emoji are never cut in half.
 */
export const TITLE_MAX = 160;

/** Shortens text to at most `max` characters, ending with "…" when cut. */
export function clampText(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(0, max - 1)).join("").trimEnd()}…`;
}

/** A title that fits: spaces collapsed, never empty, cut with "…". */
export function clampTitle(title: string, max: number = TITLE_MAX, fallback = "Untitled"): string {
  return clampText(title.replace(/\s+/g, " ").trim() || fallback, max);
}

/** "<name> — <suffix>" that fits: the name is shortened and the suffix kept whole. */
export function titleWithSuffix(name: string, suffix: string, max: number = TITLE_MAX): string {
  const tail = ` — ${suffix}`;
  const room = max - Array.from(tail).length;
  return room < 8 ? clampTitle(`${name}${tail}`, max) : `${clampTitle(name, room)}${tail}`;
}
