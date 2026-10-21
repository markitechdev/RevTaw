/**
 * Matching for the command menu: forgiving enough for fast typing, strict
 * enough that the best match is first. Client-safe and unit-tested.
 *
 *  3   the label starts with the query          "qui"   → "Quiz"
 *  2   a word in the label starts with it       "rev"   → "Create a reviewer"
 *  1   the label contains it                    "card"  → "Flashcards"
 *  0.5 a keyword starts with it                 "test"  → "Create a quiz"
 *  0   no match
 *
 * Multi-word queries must match every word somewhere (label or keywords);
 * the score is the lowest of the words, so all of them have to fit well.
 */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function scoreWord(label: string, keywords: string, word: string): number {
  if (label.startsWith(word)) return 3;
  if (label.split(/[\s\-/(),.]+/).some((part) => part.startsWith(word))) return 2;
  if (label.includes(word)) return 1;
  if (keywords.split(/\s+/).some((part) => part.startsWith(word))) return 0.5;
  return 0;
}

export function matchScore(label: string, keywords: string | undefined, query: string): number {
  const words = normalizeForMatch(query).split(" ").filter(Boolean);
  if (words.length === 0) return 0;
  const normalizedLabel = normalizeForMatch(label);
  const normalizedKeywords = normalizeForMatch(keywords ?? "");
  if (words.length > 1 && normalizedLabel.startsWith(words.join(" "))) return 3;
  let score = Infinity;
  for (const word of words) {
    const value = scoreWord(normalizedLabel, normalizedKeywords, word);
    if (value === 0) return 0;
    score = Math.min(score, value);
  }
  return score;
}

/** The [start, end) range of the first place the query appears in the label, for highlighting. */
export function matchRange(label: string, query: string): [number, number] | null {
  const needle = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!needle) return null;
  const index = label.toLowerCase().indexOf(needle);
  return index === -1 ? null : [index, index + needle.length];
}
