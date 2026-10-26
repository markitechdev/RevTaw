import { recallsItem, tidyText } from "@/lib/quizzes/text-match";
import type { MnemonicKind } from "@/lib/supabase/database.types";

/**
 * Memory techniques (spec §16): mnemonics, memory palaces and the story
 * method — shapes, checks and the pure graders. Client-safe and free of zod;
 * the palace route validators are in `memory-schemas.ts`.
 */

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

/** Lists per session: about one every five minutes, 2-5. Practicing saved mnemonics is quicker. */
export function mnemonicCount(minutes: number, saved = false): number {
  return saved ? Math.max(2, Math.min(10, Math.round(minutes / 3))) : Math.max(2, Math.min(5, Math.round(minutes / 5)));
}

/** Saved mnemonics have no order flag; the target's wording says whether the order matters. */
export function targetIsOrdered(target: string): boolean {
  return /\b(order|ordered|sequence|steps?|stages?|phases?|first|then)\b/i.test(target);
}

/** Whether one remembered line recalls one expected item (lib/quizzes/text-match.ts). */
export const itemMatches = recallsItem;

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

// ---------------------------------------------------------------------------
// Memory palace (method of loci)
// ---------------------------------------------------------------------------

/** A stop on a palace route (validated by `palaceLocationSchema`). */
export type PalaceLocation = { name: string; detail: string | null };
/** A palace as the student saves it (validated by `palaceInputSchema`). */
export type PalaceInput = { title: string; locations: PalaceLocation[] };
export type PalaceSummary = { id: string; title: string; locations: PalaceLocation[]; lastUsedAt: string | null };

/** Places most homes have, to start a route quickly. */
export const PALACE_SUGGESTIONS = ["Front door", "Doormat", "Hallway mirror", "Coat rack", "Sofa", "Television", "Kitchen table", "Fridge", "Sink", "Stairs", "Bathroom door", "Bed", "Desk", "Window"] as const;

export type PalacePlacement = { stop: number; location: string; detail: string | null; concept: string; definition: string; association: string };
export type PalaceStage = "setup" | "place" | "walk";
/** A memory-palace session's state: the stage, the palace, and — while placing only — the placements. */
export type PalaceState = { index: number; stage: PalaceStage; palaceId: string | null; palaceTitle: string | null; placements: PalacePlacement[] };

export function palaceStateOf(state: unknown): PalaceState {
  const value = (state ?? {}) as Partial<PalaceState>;
  const stage: PalaceStage = value.stage === "place" || value.stage === "walk" ? value.stage : "setup";
  return { index: typeof value.index === "number" ? value.index : 0, stage, palaceId: value.palaceId ?? null, palaceTitle: value.palaceTitle ?? null, placements: Array.isArray(value.placements) ? value.placements : [] };
}

/** What a walk stop shows before it is answered (the concept stays on the server). */
export type LociView = { stop: number; total: number; location: string; detail: string | null; previous: string | null };
export type LociKey = { concept: string; definition: string; association: string };
export type LociResult = LociKey & { isCorrect: boolean; given: string };

export function lociViewOf(analysis: unknown): LociView | null {
  const view = analysis as Partial<LociView> | null;
  if (!view || typeof view.stop !== "number" || typeof view.location !== "string") return null;
  return { stop: view.stop, total: view.total ?? view.stop, location: view.location, detail: view.detail ?? null, previous: view.previous ?? null };
}

export function lociResultOf(analysis: unknown): LociResult | null {
  const result = (analysis as { result?: LociResult } | null)?.result;
  return result && typeof result.concept === "string" && typeof result.isCorrect === "boolean" ? result : null;
}

/** Stops per walk: about one per 90 seconds, 3-12, never more than the route has places or the material has concepts. */
export function palaceStopCount(minutes: number, locations: number, concepts: number): number {
  return Math.max(0, Math.min(locations, concepts, Math.max(3, Math.min(12, Math.round(minutes / 1.5)))));
}

/** Same place on a route, whatever the case and spacing. */
export function sameLocation(a: string, b: string): boolean {
  return tidyText(a) === tidyText(b);
}

// ---------------------------------------------------------------------------
// Story method
// ---------------------------------------------------------------------------

export type StoryParagraph = { text: string; facts: number[] };
/** What a story item shows: the original notes (facts) beside the story version, and what the story simplifies. */
export type StoryView = { title: string; facts: string[]; paragraphs: StoryParagraph[]; accuracyNote: string | null };
export type StoryResult = { score: number; isCorrect: boolean; recalled: boolean[]; incorrect: string[]; feedback: string };

/** Stories per session: about one per seven minutes, 1-3. */
export function storyCount(minutes: number): number {
  return Math.max(1, Math.min(3, Math.round(minutes / 7)));
}

/**
 * Keeps a generated story honest: fact references must point at real facts,
 * and only facts the story actually carries are kept (renumbered), so a
 * retelling is never graded on a fact the story left out. Null when fewer
 * than two facts remain.
 */
export function tidyStory(story: { title: string; facts: string[]; paragraphs: StoryParagraph[]; accuracy_note?: string | null }): StoryView | null {
  const valid = (value: number) => Number.isInteger(value) && value >= 1 && value <= story.facts.length;
  const carried = [...new Set(story.paragraphs.flatMap((paragraph) => paragraph.facts.filter(valid)))].sort((a, b) => a - b);
  if (carried.length < 2) return null;
  const renumber = new Map(carried.map((value, index) => [value, index + 1]));
  return {
    title: story.title,
    facts: carried.map((value) => story.facts[value - 1]),
    paragraphs: story.paragraphs.map((paragraph) => ({ text: paragraph.text, facts: [...new Set(paragraph.facts.filter(valid))].map((value) => renumber.get(value)!).sort((a, b) => a - b) })),
    accuracyNote: story.accuracy_note?.trim() || null,
  };
}

export function storyViewOf(analysis: unknown): StoryView | null {
  const view = analysis as Partial<StoryView> | null;
  if (!view || typeof view.title !== "string" || !Array.isArray(view.facts) || !Array.isArray(view.paragraphs)) return null;
  return { title: view.title, facts: view.facts, paragraphs: view.paragraphs, accuracyNote: view.accuracyNote ?? null };
}

export function storyResultOf(analysis: unknown): StoryResult | null {
  const result = (analysis as { result?: StoryResult } | null)?.result;
  return result && typeof result.score === "number" && Array.isArray(result.recalled) ? result : null;
}

/** Retelling score: the share of facts recalled, minus 15 points per statement that contradicts the notes. */
export function retellScore(recalled: boolean[], contradictions: number): number {
  const share = recalled.length ? recalled.filter(Boolean).length / recalled.length : 0;
  return Math.max(0, Math.min(100, Math.round(share * 100) - 15 * contradictions));
}
