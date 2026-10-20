import { describe, expect, it } from "vitest";

import { mnemonicsHeuristically } from "@/lib/ai/providers/mock-study";
import { deviceMatchesItems, gradeListRecall, initials, itemMatches, listScore, mnemonicCount, mnemonicResultOf, mnemonicViewOf, splitRecalledList, targetIsOrdered } from "@/lib/study/memory-options";

const stages = ["Prophase", "Metaphase", "Anaphase", "Telophase"];

describe("list recall grading", () => {
  it("splits a recalled list on lines, semicolons and commas, ignoring numbering and bullets", () => {
    expect(splitRecalledList("1. Prophase\n2) Metaphase; - Anaphase, • Telophase")).toEqual(stages);
    expect(splitRecalledList("water (H2O, liquid), carbon dioxide")).toEqual(["water (H2O, liquid)", "carbon dioxide"]);
  });

  it("matches items leniently but not by accident", () => {
    expect(itemMatches("prophase", "Prophase")).toBe(true);
    expect(itemMatches("the light dependent reactions", "Light-Dependent Reactions")).toBe(true);
    expect(itemMatches("ana", "Anaphase")).toBe(false);
    expect(itemMatches("", "Anaphase")).toBe(false);
  });

  it("scores the share recalled and checks the order", () => {
    expect(gradeListRecall(stages, stages.join("\n"))).toEqual({ score: 100, marks: [true, true, true, true], inOrder: true });
    const swapped = gradeListRecall(stages, "Metaphase\nProphase\nAnaphase\nTelophase");
    expect(swapped.score).toBe(100);
    expect(swapped.inOrder).toBe(false);
    const half = gradeListRecall(stages, "Prophase, Anaphase");
    expect(half).toEqual({ score: 50, marks: [true, false, true, false], inOrder: true });
    expect(gradeListRecall(stages, "").score).toBe(0);
  });

  it("does not count one line twice", () => {
    expect(gradeListRecall(["Anaphase", "Anaphase I"], "Anaphase").marks.filter(Boolean)).toHaveLength(1);
  });

  it("cuts the score of an ordered list recalled out of order", () => {
    expect(listScore({ score: 100, inOrder: false }, true)).toBe(75);
    expect(listScore({ score: 100, inOrder: false }, false)).toBe(100);
    expect(listScore({ score: 80, inOrder: true }, true)).toBe(80);
  });
});

describe("mnemonic devices", () => {
  it("accepts an acronym only when it spells the items' first letters in order", () => {
    expect(initials(stages)).toBe("PMAT");
    expect(deviceMatchesItems({ kind: "acronym", content: "PMAT" }, stages)).toBe(true);
    expect(deviceMatchesItems({ kind: "acronym", content: "Remember P.M.A.T. for the phases" }, stages)).toBe(true);
    expect(deviceMatchesItems({ kind: "acronym", content: "PAMT" }, stages)).toBe(false);
  });

  it("accepts an acrostic with a run of words in the items' order", () => {
    expect(deviceMatchesItems({ kind: "acrostic", content: "Please Make Another Tea" }, stages)).toBe(true);
    expect(deviceMatchesItems({ kind: "acrostic", content: "Remember: Please Make Another Tea!" }, stages)).toBe(true);
    expect(deviceMatchesItems({ kind: "acrostic", content: "Make Please Another Tea" }, stages)).toBe(false);
    expect(deviceMatchesItems({ kind: "rhyme", content: "anything goes" }, stages)).toBe(true);
  });

  it("knows when the order matters and how many lists fit the time", () => {
    expect(targetIsOrdered("The stages of mitosis, in order")).toBe(true);
    expect(targetIsOrdered("The four tissue types")).toBe(false);
    expect(mnemonicCount(5)).toBe(2);
    expect(mnemonicCount(15)).toBe(3);
    expect(mnemonicCount(60)).toBe(5);
    expect(mnemonicCount(30, true)).toBe(10);
  });

  it("reads an item's view and stored result defensively", () => {
    expect(mnemonicViewOf(null)).toBeNull();
    expect(mnemonicViewOf({ target: "x", items: ["a", "b"], options: [] })).toMatchObject({ ordered: true, saved: {}, fromSaved: null });
    expect(mnemonicResultOf({ result: { score: 50, marks: [true, false], inOrder: true, isCorrect: false, chosen: 0 } })?.score).toBe(50);
    expect(mnemonicResultOf({})).toBeNull();
  });
});

describe("mock mnemonic heuristics", () => {
  const transcript = `[Section: Photosynthesis Overview]
Photosynthesis Overview
Photosynthesis is the process by which green plants convert light energy into chemical energy.
The overall equation is 6CO2 + 6H2O -> C6H12O6 + 6O2.

[Section: Calvin Cycle]
Calvin Cycle
The Calvin cycle is the set of reactions that fixes carbon dioxide into sugar using ATP and NADPH.
It takes place in the stroma of the chloroplast.`;

  it("writes accurate devices for the material's lists", () => {
    const { targets } = mnemonicsHeuristically(transcript, "Material title: photosynthesis\nProduce exactly 3 targets.");
    expect(targets.length).toBeGreaterThanOrEqual(2);
    expect(targets[0].items).toEqual(["Photosynthesis Overview", "Calvin Cycle"]);
    for (const target of targets) {
      expect(target.items.length).toBeGreaterThanOrEqual(2);
      expect(target.options.map((option) => option.kind)).toEqual(["acronym", "acrostic", "phrase"]);
      expect(target.options.every((option) => deviceMatchesItems(option, target.items))).toBe(true);
    }
  });
});
