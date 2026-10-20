/** Lenient text matching shared by quiz grading and the study exercises. Pure and client-safe. */

/** Lowercases, strips punctuation/articles and collapses whitespace for lenient text matching. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/(^|\s)(?:the|a|an)(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, "");
}

function numeric(value: string): number | null {
  const match = value.replace(/[,\s]/g, "").match(/^-?\d+(?:\.\d+)?$/);
  return match ? Number(match[0]) : null;
}

/** Lenient equality for identification / fill-in answers. */
export function textMatches(student: string, accepted: string[]): boolean {
  const given = normalizeText(student);
  if (!given) return false;
  const givenNumber = numeric(given);
  return accepted.some((candidate) => {
    const expected = normalizeText(candidate);
    if (!expected) return false;
    if (given === expected) return true;
    const expectedNumber = numeric(expected);
    if (givenNumber !== null && expectedNumber !== null) return Math.abs(givenNumber - expectedNumber) < 1e-9;
    // Tolerate a trailing "s" / "es" and a surrounding article.
    const singular = (text: string) => text.replace(/(es|s)$/, "");
    return singular(given) === singular(expected);
  });
}
