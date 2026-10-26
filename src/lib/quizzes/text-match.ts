/** Lenient text matching shared by quiz grading and the study exercises. Pure and client-safe. */

/** An article in front of an answer ("the mitochondria", "ang mga halaman", "si Rizal"): not part of it. */
const LEADING_ARTICLE = /^(?:the|an|a|ang mga|ang|mga|si|sina)\s+(?=\S)/;

/**
 * Lowercases, drops accents and punctuation, and collapses whitespace for lenient text matching. A hyphen
 * between letters becomes a space ("chlorophyll-a" = "chlorophyll a") and a dot that isn't a decimal point is
 * dropped ("U.S." = "US"). "the" and "an" are dropped anywhere; any other article ("a", Filipino "ang", "mga",
 * "si") only in front of the answer, so a letter that is the answer stays: "Vitamin A" is not "vitamin", and
 * "A" is still "a".
 */
export function normalizeText(value: string): string {
  const cleaned = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/(?<=\p{L})-(?=\p{L})/gu, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Stray hyphens at the ends go, a minus sign stays ("-5" is not "5").
    .replace(/^(?:\s|-(?!\d))+|[\s-]+$/g, "");
  const withoutArticles = cleaned
    .replace(/(^|\s)(?:the|an)(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEADING_ARTICLE, "");
  return withoutArticles || cleaned;
}

function numeric(value: string): number | null {
  const match = value.replace(/[,\s]/g, "").match(/^-?\d+(?:\.\d+)?$/);
  return match ? Number(match[0]) : null;
}

/** One is the other with a plural ending ("genes"/"gene", "boxes"/"box"); the singular has at least 3 letters. */
function pluralOf(a: string, b: string): boolean {
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  if (short.length < 3) return false;
  return long === `${short}s` || long === `${short}es`;
}

function same(given: string, expected: string): boolean {
  if (given === expected) return true;
  // Spacing alone: "x ray" = "xray", "photo synthesis" = "photosynthesis".
  const a = given.replace(/\s/g, "");
  const b = expected.replace(/\s/g, "");
  return a === b || pluralOf(a, b);
}

/** Lenient equality for identification / fill-in answers: wording, spacing, articles and plurals may differ, spelling may not. */
export function textMatches(student: string, accepted: string[]): boolean {
  const given = normalizeText(student);
  if (!given) return false;
  const givenNumber = numeric(given);
  return accepted.some((candidate) => {
    const expected = normalizeText(candidate);
    if (!expected) return false;
    const expectedNumber = numeric(expected);
    if (givenNumber !== null && expectedNumber !== null) return Math.abs(givenNumber - expectedNumber) < 1e-9;
    return same(given, expected);
  });
}

/** Edit distance with adjacent swaps (optimal string alignment), stopping early past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, before[j - 2] + 1);
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
    before = previous;
    previous = current;
  }
  return previous[b.length];
}

/**
 * Whether a wrong answer is a near miss of an accepted one: the same word with a slip in spelling (one letter
 * off, or two in a long answer). It earns no credit (spelling counts on exams) but the feedback can say so.
 */
export function nearMiss(student: string, accepted: string[]): boolean {
  const given = normalizeText(student).replace(/\s/g, "");
  if (given.length < 4 || numeric(given) !== null || textMatches(student, accepted)) return false;
  return accepted.some((candidate) => {
    const expected = normalizeText(candidate).replace(/\s/g, "");
    if (expected.length < 5 || numeric(expected) !== null) return false;
    const allowed = expected.length >= 10 ? 2 : 1;
    return editDistance(given, expected, allowed) <= allowed;
  });
}

/** Normalized text with hyphens and dots read as spaces ("light-dependent" = "light dependent"). */
export function tidyText(value: string): string {
  return normalizeText(value).replace(/[-.]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Small words that carry no item of their own ("release OF energy", "ang mga"). */
const FILLER_WORDS = new Set(["the", "a", "an", "of", "and", "in", "on", "to", "for", "by", "with", "from", "ang", "ng", "sa", "mga", "na", "at", "si"]);
/** Generic nouns an answer may leave out ("energy carrier" for "energy carrier molecule"), unless they are the whole item. */
const GENERIC_WORDS = new Set(["molecule", "molecules", "process", "processes", "compound", "compounds", "substance", "substances", "system"]);
/** A line that negates what it names doesn't recall it: "not mitosis", "hindi mitosis". */
const NEGATION = /(?:^|\s)(?:not|no|never|none|without|except|isnt|arent|doesnt|dont|hindi|wala|di)(?=\s|$)/;

/** Forms of a word: itself and without a plural or verb ending ("cells", "released", "releasing"). */
function wordForms(word: string): string[] {
  if (word.length < 4) return [word];
  const forms = [word];
  for (const [ending, replacement] of [["es", ""], ["s", ""], ["ed", ""], ["ed", "e"], ["d", ""], ["ing", ""], ["ing", "e"]] as const) {
    if (word.endsWith(ending) && word.length - ending.length >= 3) forms.push(word.slice(0, -ending.length) + replacement);
  }
  return forms;
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const forms = new Set(wordForms(a));
  return wordForms(b).some((form) => forms.has(form));
}

/**
 * Whether a remembered line or cell recalls one expected item (a list item, a palace stop, a table cell). Wording may differ (articles, plurals, word
 * endings, word order, a note after the item: "prophase: chromosomes condense"), but every word that
 * makes the item what it is must be there, so a fragment ("phase" for "Prophase"), a near neighbor
 * ("light independent" for "light dependent", "Anaphase II" for "Anaphase I") or a negation ("not
 * mitosis") doesn't count. No spelling slack: "ileum" and "ilium" are different organs.
 */
export function recallsItem(given: string, expected: string): boolean {
  const a = tidyText(given);
  const b = tidyText(expected);
  if (!a || !b) return false;
  if (a === b || a.replace(/\s/g, "") === b.replace(/\s/g, "")) return true;
  if (NEGATION.test(a.replace(/'/g, "")) && !NEGATION.test(b.replace(/'/g, ""))) return false;
  const givenWords = a.split(" ");
  const contentWords = b.split(" ").filter((word) => !FILLER_WORDS.has(word));
  const specific = contentWords.filter((word) => !GENERIC_WORDS.has(word));
  const itemWords = specific.length > 0 ? specific : contentWords;
  if (itemWords.length === 0) return false;
  const found = itemWords.filter((word) => givenWords.some((other) => sameWord(other, word))).length;
  // Short items need every word; a long description most of them (three of four, four of five…).
  const needed = itemWords.length <= 3 ? itemWords.length : Math.ceil(itemWords.length * 0.75);
  return found >= needed;
}
