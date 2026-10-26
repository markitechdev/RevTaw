/**
 * Dual-coding visuals (spec §16): the shapes RevTaw draws next to the text —
 * tables, flowcharts, timelines, hierarchies and concept relationships — and
 * the pure helpers behind the "rebuild it from memory" exercises. Client-safe.
 */

import { normalizeText, recallsItem } from "@/lib/quizzes/text-match";
import { sameRelation } from "@/lib/study/relations";

export type Visual =
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "flowchart"; steps: Array<{ label: string; detail?: string | null }> }
  | { type: "timeline"; events: Array<{ when: string; label: string; detail?: string | null }> }
  | { type: "hierarchy"; root: string; children: Array<{ label: string; children?: Array<{ label: string }> }> }
  | { type: "relationships"; nodes: string[]; links: Array<{ from: string; to: string; relation: string }> };

export type VisualType = Visual["type"];

export type VisualTopic = { title: string; concept: string; text: string; visual: Visual };

export const VISUAL_TYPE_LABEL: Record<VisualType, string> = {
  table: "Table",
  flowchart: "Flowchart",
  timeline: "Timeline",
  hierarchy: "Diagram",
  relationships: "Concept relationships",
};

export type DualView = "text" | "visual" | "combined";

/** Deterministic shuffle (same order on the server and in the browser). */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let state = 0;
  for (let index = 0; index < seed.length; index += 1) state = (state * 31 + seed.charCodeAt(index)) >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  // Never hand back the original order when there is more than one item.
  if (result.length > 1 && result.every((item, index) => item === items[index])) result.push(result.shift()!);
  return result;
}

/** The longest increasing run of positions: how many items already stand in the right relative order. */
function inOrderCount(order: number[]): number {
  const tails: number[] = [];
  for (const value of order) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (tails[middle] < value) low = middle + 1;
      else high = middle;
    }
    tails[low] = value;
  }
  return tails.length;
}

/** Share of the order that is right (its longest increasing run of positions). */
export function orderScore(order: number[]): number {
  if (order.length === 0) return 0;
  return Math.round((inOrderCount(order) / order.length) * 100);
}

/**
 * Where a "put it back in order" exercise starts: of a few seeded shuffles, the one with the least already in
 * order, so the starting order itself earns (almost) nothing. Deterministic: the same on the server and in
 * the browser.
 */
export function rebuildStart(count: number, seed: string): number[] {
  const indices = Array.from({ length: count }, (_, index) => index);
  let best = seededShuffle(indices, seed);
  for (let attempt = 1; attempt < 12 && inOrderCount(best) > 1; attempt += 1) {
    const candidate = seededShuffle(indices, `${seed}:${attempt}`);
    if (inOrderCount(candidate) < inOrderCount(best)) best = candidate;
  }
  return best;
}

/**
 * An order scored for what the student put in order: 0 for handing the starting order back (or making it
 * worse), 100 when every item is in place, and the share of the remaining distance in between.
 */
export function rebuildOrderScore(order: number[], start: number[]): number {
  const total = order.length;
  if (total === 0) return 0;
  const got = inOrderCount(order);
  if (got === total) return 100;
  const base = Math.min(inOrderCount(start), total - 1);
  return Math.max(0, Math.round(((got - base) / (total - base)) * 100));
}

/** Table cells hidden in the rebuild exercise: every other body cell after the first column. */
export function tableBlanks(visual: Extract<Visual, { type: "table" }>): Array<{ row: number; column: number }> {
  const blanks: Array<{ row: number; column: number }> = [];
  visual.rows.forEach((row, rowIndex) => {
    row.forEach((_, columnIndex) => {
      if (columnIndex > 0 && (rowIndex + columnIndex) % 2 === 1) blanks.push({ row: rowIndex, column: columnIndex });
    });
  });
  if (blanks.length === 0 && visual.rows[0]?.length > 1) blanks.push({ row: 0, column: 1 });
  return blanks;
}

/** Nodes of a hierarchy below the root with their parent label (for the "which parent?" exercise). */
export function hierarchyPairs(visual: Extract<Visual, { type: "hierarchy" }>): Array<{ label: string; parent: string }> {
  return visual.children.flatMap((child) => [{ label: child.label, parent: visual.root }, ...(child.children ?? []).map((grandchild) => ({ label: grandchild.label, parent: child.label }))]);
}

/** What the rebuild exercise asks for, by visual type. */
export function rebuildPrompt(type: VisualType): string {
  switch (type) {
    case "flowchart":
      return "Put the steps back in order.";
    case "timeline":
      return "Put the events back in order.";
    case "table":
      return "Fill in the missing cells.";
    case "hierarchy":
      return "Attach every part to the right parent.";
    case "relationships":
      return "Name the relationship on every link.";
  }
}

export type VisualAnswer =
  | { kind: "order"; order: number[] }
  | { kind: "cells"; cells: Array<{ row: number; column: number; value: string }> }
  | { kind: "parents"; parents: Array<{ label: string; parent: string }> }
  | { kind: "relations"; relations: string[] };

/** Lenient cell match: the cell's words in any order and form, but every word that makes it what it is (text-match.ts recallsItem). */
export function cellMatches(given: string, expected: string): boolean {
  return recallsItem(given, expected);
}

/**
 * Grades a rebuild against the visual; marks say which parts were right. `seed` (the item's id) gives the
 * order a "put it back in order" exercise started from, so the score counts only what the student fixed.
 */
export function gradeVisual(visual: Visual, answer: VisualAnswer, seed?: string): { score: number; marks: boolean[] } {
  switch (visual.type) {
    case "flowchart":
    case "timeline": {
      const count = visual.type === "flowchart" ? visual.steps.length : visual.events.length;
      const order = answer.kind === "order" ? answer.order : [];
      const valid = order.length === count && new Set(order).size === count && order.every((value) => value >= 0 && value < count);
      if (!valid) return { score: 0, marks: Array.from({ length: count }, () => false) };
      const score = seed === undefined ? orderScore(order) : rebuildOrderScore(order, rebuildStart(count, seed));
      return { score, marks: order.map((value, index) => value === index) };
    }
    case "table": {
      const blanks = tableBlanks(visual);
      const given = answer.kind === "cells" ? answer.cells : [];
      const marks = blanks.map((blank) => cellMatches(given.find((cell) => cell.row === blank.row && cell.column === blank.column)?.value ?? "", visual.rows[blank.row]?.[blank.column] ?? ""));
      return { score: Math.round((marks.filter(Boolean).length / Math.max(1, marks.length)) * 100), marks };
    }
    case "hierarchy": {
      const pairs = hierarchyPairs(visual);
      const given = answer.kind === "parents" ? answer.parents : [];
      const marks = pairs.map((pair) => normalizeText(given.find((entry) => entry.label === pair.label)?.parent ?? "") === normalizeText(pair.parent));
      return { score: Math.round((marks.filter(Boolean).length / Math.max(1, marks.length)) * 100), marks };
    }
    case "relationships": {
      const given = answer.kind === "relations" ? answer.relations : [];
      // A synonym of the material's wording counts ("causes" for "leads to").
      const marks = visual.links.map((link, index) => sameRelation(given[index] ?? "", link.relation));
      return { score: Math.round((marks.filter(Boolean).length / Math.max(1, marks.length)) * 100), marks };
    }
  }
}

export function visualAsText(visual: Visual): string {
  switch (visual.type) {
    case "flowchart":
      return visual.steps.map((step, index) => `${index + 1}. ${step.label}`).join(" → ");
    case "timeline":
      return visual.events.map((event) => `${event.when}: ${event.label}`).join("; ");
    case "table":
      return [visual.columns.join(" | "), ...visual.rows.map((row) => row.join(" | "))].join("\n");
    case "hierarchy":
      return hierarchyPairs(visual).map((pair) => `${pair.parent} > ${pair.label}`).join("; ");
    case "relationships":
      return visual.links.map((link) => `${link.from} — ${link.relation} → ${link.to}`).join("; ");
  }
}
