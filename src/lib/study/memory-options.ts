import { normalizeText } from "@/lib/quizzes/text-match";
import type { MnemonicKind } from "@/lib/supabase/database.types";

/** Memory techniques (spec §16): mnemonic kinds, the device checks and the pure list-recall grader. Client-safe. */

export const MNEMONIC_KINDS = ["acronym", "acrostic", "rhyme", "phrase", "association", "story", "custom"] as const satisfies ReadonlyArray<MnemonicKind>;

export const MNEMONIC_KIND_LABEL: Record<MnemonicKind, string> = {
  acronym: "Acronym",
  acrostic: "Acrostic",
  rhyme: "Rhyme",
  phrase: "Memory phrase",
  association: "Association",
  story: "Educational story",
  custom: "My own",
};

/** One memory device for a list: what it says and how it maps back to the items. */
export type MnemonicOption = { kind: MnemonicKind; content: string; explanation: string | null };

/** What a mnemonic session item carries in `analysis` (the list is studied openly before it is recalled). */
export type MnemonicItemView = {
  target: string;
  items: string[];
  ordered: boolean;
  options: MnemonicOption[];
  /** Option index → id of the saved copy in the student's mnemonics. */
  saved: Record<string, string>;
  /** Set when the item practices a mnemonic the student saved earlier. */
  fromSaved: string | null;
};

export type MnemonicPracticeResult = { score: number; marks: boolean[]; inOrder: boolean; isCorrect: boolean; chosen: number };

/** Reads a mnemonic item's `analysis` (null when it is not one). */
export function mnemonicViewOf(analysis: unknown): MnemonicItemView | null {
  const view = analysis as Partial<MnemonicItemView> | null;
  if (!view || typeof view.target !== "string" || !Array.isArray(view.items) || !Array.isArray(view.options)) return null;
  return { target: view.target, items: view.items, ordered: view.ordered ?? true, options: view.options, saved: view.saved ?? {}, fromSaved: view.fromSaved ?? null };
}

/** The stored practice result of an answered mnemonic item. */
export function mnemonicResultOf(analysis: unknown): MnemonicPracticeResult | null {
  const result = (analysis as { result?: MnemonicPracticeResult } | null)?.result;
  return result && typeof result.score === "number" && Array.isArray(result.marks) ? result : null;
}

/** Lists per session: about one every five minutes, 2-5. Practising saved mnemonics is quicker. */
export function mnemonicCount(minutes: number, saved = false): number {
  return saved ? Math.max(2, Math.min(10, Math.round(minutes / 3))) : Math.max(2, Math.min(5, Math.round(minutes / 5)));
}

/** Saved mnemonics have no order flag; the target's wording says whether the order matters. */
export function targetIsOrdered(target: string): boolean {
  return /\b(order|ordered|sequence|steps?|stages?|phases?|first|then)\b/i.test(target);
}

/** Normalized text with hyphens and dots read as spaces ("light-dependent" = "light dependent"). */
function tidy(value: string): string {
  return normalizeText(value).replace(/[-.]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Lenient match of one remembered line against one expected item. */
export function itemMatches(given: string, expected: string): boolean {
  const a = tidy(given);
  const b = tidy(expected);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || (b.includes(a) && a.length >= 4)) return true;
  const words = b.split(" ").filter((word) => word.length >= 4);
  if (words.length === 0) return false;
  const present = new Set(a.split(" "));
  return words.filter((word) => present.has(word)).length / words.length >= 0.6;
}

/** Splits a recalled list into lines: one item per line, or separated by semicolons or commas (not inside brackets); numbering and bullets are ignored. */
export function splitRecalledList(answer: string): string[] {
  return answer
    .split(/\n|;|,(?![^(]*\))/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean);
}

/** Grades a recalled list: share recalled, which items were found, and whether their order holds. */
export function gradeListRecall(expected: string[], answer: string): { score: number; marks: boolean[]; inOrder: boolean } {
  const lines = splitRecalledList(answer);
  const used = new Set<number>();
  const positions: number[] = [];
  const marks = expected.map((item) => {
    const found = lines.findIndex((line, index) => !used.has(index) && itemMatches(line, item));
    if (found === -1) return false;
    used.add(found);
    positions.push(found);
    return true;
  });
  const inOrder = positions.every((value, index) => index === 0 || value > positions[index - 1]);
  return { score: Math.round((marks.filter(Boolean).length / Math.max(1, expected.length)) * 100), marks, inOrder };
}

/** The final score of a practice: recall share, cut by a quarter when an ordered list comes back out of order. */
export function listScore(graded: { score: number; inOrder: boolean }, ordered: boolean): number {
  return ordered && !graded.inOrder ? Math.round(graded.score * 0.75) : graded.score;
}

/** First characters of the items (upper case), in order. */
export function initials(items: string[]): string {
  return items.map((item) => item.trim()[0]?.toUpperCase() ?? "").join("");
}

/**
 * Accuracy guard for generated devices: an acronym must spell the items'
 * first letters in order, and an acrostic must have a run of words starting
 * with them. Other kinds are checked by the prompt's accuracy rule.
 */
export function deviceMatchesItems(option: Pick<MnemonicOption, "kind" | "content">, items: string[]): boolean {
  const letters = initials(items);
  if (!letters) return false;
  if (option.kind === "acronym") {
    const tokens = option.content.replace(/\./g, "").match(/[A-Za-z0-9]+/g) ?? [];
    return tokens.some((token) => token.toUpperCase() === letters);
  }
  if (option.kind === "acrostic") {
    const words = option.content.match(/[A-Za-z0-9][\w'-]*/g) ?? [];
    const firsts = words.map((word) => word[0].toUpperCase()).join("");
    return firsts.includes(letters);
  }
  return true;
}
