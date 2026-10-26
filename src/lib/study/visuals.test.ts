import { describe, expect, it } from "vitest";

import { visualsHeuristically } from "@/lib/ai/providers/mock-study";
import { visualSetSchema } from "@/lib/study/prompts/visual";
import { cellMatches, gradeVisual, hierarchyPairs, orderScore, rebuildOrderScore, rebuildStart, seededShuffle, tableBlanks, visualAsText, type Visual } from "@/lib/study/visuals";

describe("dual-coding visuals", () => {
  it("shuffles deterministically and never returns the original order", () => {
    const items = [0, 1, 2, 3, 4];
    expect(seededShuffle(items, "abc")).toEqual(seededShuffle(items, "abc"));
    expect(seededShuffle(items, "abc")).not.toEqual(items);
    expect([...seededShuffle(items, "xyz")].sort()).toEqual(items);
  });

  it("scores an order by its longest correct run", () => {
    expect(orderScore([0, 1, 2, 3])).toBe(100);
    expect(orderScore([1, 0, 2, 3])).toBe(75);
    expect(orderScore([3, 2, 1, 0])).toBe(25);
  });

  it("gives no credit for handing back the starting order", () => {
    for (const [count, seed] of [[3, "item-a"], [5, "item-b"], [6, "item-c"], [8, "item-d"]] as const) {
      const start = rebuildStart(count, seed);
      expect(start).toEqual(rebuildStart(count, seed));
      expect([...start].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, index) => index));
      expect(rebuildOrderScore(start, start)).toBe(0);
      const flow: Visual = { type: "flowchart", steps: Array.from({ length: count }, (_, index) => ({ label: `Step ${index}` })) };
      expect(gradeVisual(flow, { kind: "order", order: start }, seed).score).toBe(0);
      expect(gradeVisual(flow, { kind: "order", order: Array.from({ length: count }, (_, index) => index) }, seed).score).toBe(100);
    }
    // One step left out of place after fixing the rest: most of the way.
    expect(rebuildOrderScore([0, 1, 2, 4, 3], [4, 3, 2, 1, 0])).toBe(75);
  });

  it("grades every kind of rebuild", () => {
    const flow: Visual = { type: "flowchart", steps: [{ label: "A" }, { label: "B" }, { label: "C" }] };
    expect(gradeVisual(flow, { kind: "order", order: [0, 1, 2] }).score).toBe(100);
    expect(gradeVisual(flow, { kind: "order", order: [0, 0, 1] }).score).toBe(0);
    const table: Visual = { type: "table", columns: ["Term", "Meaning", "Example"], rows: [["ATP", "energy carrier molecule", "muscle contraction"], ["NADPH", "electron carrier", "Calvin cycle"]] };
    const blanks = tableBlanks(table);
    expect(blanks.length).toBeGreaterThan(0);
    const cells = blanks.map((blank) => ({ ...blank, value: table.rows[blank.row][blank.column] }));
    expect(gradeVisual(table, { kind: "cells", cells }).score).toBe(100);
    const tree: Visual = { type: "hierarchy", root: "Cell", children: [{ label: "Nucleus", children: [{ label: "DNA" }] }, { label: "Membrane" }] };
    expect(hierarchyPairs(tree)).toEqual([{ label: "Nucleus", parent: "Cell" }, { label: "DNA", parent: "Nucleus" }, { label: "Membrane", parent: "Cell" }]);
    expect(gradeVisual(tree, { kind: "parents", parents: [{ label: "Nucleus", parent: "Cell" }, { label: "DNA", parent: "Cell" }, { label: "Membrane", parent: "Cell" }] }).score).toBe(67);
    const graph: Visual = { type: "relationships", nodes: ["Light", "ATP"], links: [{ from: "Light", to: "ATP", relation: "leads to" }] };
    expect(gradeVisual(graph, { kind: "relations", relations: ["Leads to"] }).marks).toEqual([true]);
    expect(visualAsText(graph)).toBe("Light — leads to → ATP");
  });

  it("matches table cells leniently", () => {
    expect(cellMatches("an energy carrier", "energy carrier molecule")).toBe(true);
    expect(cellMatches("sugar", "energy carrier molecule")).toBe(false);
  });

  it("mock visual sets validate and mix visual types", () => {
    const transcript = `[Section: Photosynthesis Overview]\nPhotosynthesis is the process by which green plants convert light energy into chemical energy. The overall equation is 6CO2 + 6H2O -> C6H12O6 + 6O2. Chlorophyll is a pigment that absorbs light.\n\n[Section: Calvin Cycle]\nThe Calvin cycle is the set of reactions that fixes carbon dioxide into sugar. It takes place in the stroma. ATP is the energy carrier. NADPH is the electron carrier.\n\n[Section: History]\nIn 1771 Joseph Priestley showed that plants restore air. In 1779 Jan Ingenhousz showed that light is needed. In 1950 Melvin Calvin traced carbon.`;
    const set = visualSetSchema.parse(visualsHeuristically(transcript, "Produce exactly 3 topics."));
    expect(new Set(set.topics.map((topic) => topic.visual.type)).size).toBe(3);
    expect(set.topics.some((topic) => topic.visual.type === "timeline")).toBe(true);
  });
});
