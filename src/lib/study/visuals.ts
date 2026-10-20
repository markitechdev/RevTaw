/**
 * Dual-coding visuals (spec §16): the shapes RevTaw draws next to the text —
 * tables, flowcharts, timelines, hierarchies and concept relationships — and
 * the pure helpers behind the "rebuild it from memory" exercises. Client-safe.
 */

import { normalizeText } from "@/lib/quizzes/text-match";

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

/** Length of the longest increasing run of positions: how much of the order is right. */
export function orderScore(order: number[]): number {
  if (order.length === 0) return 0;
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
  return Math.round((tails.length / order.length) * 100);
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

/** Lenient cell match: same normalized text, or most of the expected words present. */
export function cellMatches(given: string, expected: string): boolean {
  const a = normalizeText(given);
  const b = normalizeText(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  const words = b.split(" ").filter((word) => word.length >= 4);
  if (words.length === 0) return a.includes(b);
  const present = new Set(a.split(" "));
  return words.filter((word) => present.has(word)).length / words.length >= 0.6;
}

/** Grades a rebuild against the visual; marks say which parts were right. */
export function gradeVisual(visual: Visual, answer: VisualAnswer): { score: number; marks: boolean[] } {
  switch (visual.type) {
    case "flowchart":
    case "timeline": {
      const count = visual.type === "flowchart" ? visual.steps.length : visual.events.length;
      const order = answer.kind === "order" ? answer.order : [];
      const valid = order.length === count && new Set(order).size === count && order.every((value) => value >= 0 && value < count);
      if (!valid) return { score: 0, marks: Array.from({ length: count }, () => false) };
      return { score: orderScore(order), marks: order.map((value, index) => value === index) };
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
      const marks = visual.links.map((link, index) => normalizeText(given[index] ?? "") === normalizeText(link.relation));
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
