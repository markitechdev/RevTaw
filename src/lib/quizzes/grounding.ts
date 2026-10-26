/**
 * Checking generated questions against the student's material, and against each other. Pure (no I/O) so it
 * is testable; the quiz generator runs every question through it before anything is stored.
 */

/** The words of a text for matching: lowercase letters and numbers in any script, accents dropped. */
export function matchWords(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/** Words too common to tell two questions apart. */
const COMMON_WORDS = new Set(
  "the a an of and or to in on at for by with from is are was were be been it its this that these those which what who whom when where why how does do did can could should would will not no as into than then there their they he she his her them ang ng sa mga na at ay si ni ito iyan iyon".split(" "),
);

function contentWords(text: string): Set<string> {
  return new Set(matchWords(text).filter((word) => !COMMON_WORDS.has(word)));
}

/** Share of the words two texts have in common (Jaccard), from 0 to 1. */
export function overlap(a: string, b: string): number {
  const left = contentWords(a);
  const right = contentWords(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** The student's material, indexed for checking quotes and answers against it. */
export class MaterialText {
  private readonly joined: string;
  private readonly sentences: Array<{ text: string; words: Set<string> }>;

  constructor(texts: string[]) {
    const all = texts.join("\n");
    this.joined = ` ${matchWords(all).join(" ")} `;
    this.sentences = all
      .split(/(?<=[.!?])\s+|\n+/)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ text, words: new Set(matchWords(text)) }))
      .filter((sentence) => sentence.words.size > 0);
  }

  /** Whether the material has this phrase word for word (case, accents and punctuation aside). */
  has(phrase: string): boolean {
    const words = matchWords(phrase);
    return words.length > 0 && this.joined.includes(` ${words.join(" ")} `);
  }

  /**
   * The material's own words for a quote: the quote itself when the material has it word for word (each
   * part, when it skips with "..."), otherwise the sentence or two of the material that hold at least
   * `minShare` of its words. null when the material doesn't have it: the quote was made up.
   */
  ground(quote: string, minShare = 0.7): string | null {
    const trimmed = quote.trim();
    if (matchWords(trimmed).length < 3) return null;
    const parts = trimmed.split(/\.{3}|…/).filter((part) => matchWords(part).length > 0);
    if (parts.length > 0 && parts.every((part) => this.has(part))) return trimmed;
    const wanted = [...new Set(matchWords(trimmed))];
    let bestText = "";
    let bestFound = -1;
    for (let index = 0; index < this.sentences.length; index += 1) {
      const sentence = this.sentences[index];
      const next = this.sentences[index + 1];
      let alone = 0;
      let together = 0;
      for (const word of wanted) {
        const here = sentence.words.has(word);
        if (here) alone += 1;
        if (here || next?.words.has(word)) together += 1;
      }
      // A two-sentence window must hold strictly more of the quote than the sentence alone.
      if (alone > bestFound) {
        bestFound = alone;
        bestText = sentence.text;
      }
      if (next && together > bestFound) {
        bestFound = together;
        bestText = `${sentence.text} ${next.text}`;
      }
    }
    if (bestFound < 0 || bestFound / wanted.length < minShare) return null;
    return bestText.length > 300 ? `${bestText.slice(0, 297).trimEnd()}…` : bestText;
  }
}
