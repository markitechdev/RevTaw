import { describe, expect, it } from "vitest";

import { associationsHeuristically, mnemonicsHeuristically, retellCheckHeuristically, storiesHeuristically } from "@/lib/ai/providers/mock-study";
import {
  deviceMatchesItems,
  gradeListRecall,
  initials,
  itemMatches,
  listScore,
  lociResultOf,
  lociViewOf,
  mnemonicCount,
  mnemonicResultOf,
  mnemonicViewOf,
  palaceStateOf,
  palaceStopCount,
  retellScore,
  sameLocation,
  splitRecalledList,
  storyCount,
  storyResultOf,
  storyViewOf,
  targetIsOrdered,
  tidyStory,
} from "@/lib/study/memory-options";
import { palaceInputSchema } from "@/lib/study/memory-schemas";

const stages = ["Prophase", "Metaphase", "Anaphase", "Telophase"];

describe("list recall grading", () => {
  it("splits a recalled list on lines, semicolons and commas, ignoring numbering and bullets", () => {
    expect(splitRecalledList("1. Prophase\n2) Metaphase; - Anaphase, • Telophase")).toEqual(stages);
    expect(splitRecalledList("water (H2O, liquid), carbon dioxide")).toEqual(["water (H2O, liquid)", "carbon dioxide"]);
  });

  it("matches items leniently but not by accident", () => {
    expect(itemMatches("prophase", "Prophase")).toBe(true);
    expect(itemMatches("the light dependent reactions", "Light-Dependent Reactions")).toBe(true);
    expect(itemMatches("light-dependent reaction", "Light-Dependent Reactions")).toBe(true);
    expect(itemMatches("Prophase: chromosomes condense", "Prophase")).toBe(true);
    expect(itemMatches("carbon dioxide is released", "Release of carbon dioxide")).toBe(true);
    expect(itemMatches("ana", "Anaphase")).toBe(false);
    expect(itemMatches("", "Anaphase")).toBe(false);
  });

  it("doesn't take a fragment, a neighbor or a negation for the item", () => {
    expect(itemMatches("phase", "Prophase")).toBe(false);
    expect(itemMatches("light independent reactions", "Light-dependent reactions")).toBe(false);
    expect(itemMatches("Anaphase II", "Anaphase I")).toBe(false);
    expect(itemMatches("not mitosis", "Mitosis")).toBe(false);
    expect(itemMatches("hindi mitosis", "Mitosis")).toBe(false);
    expect(itemMatches("ileum", "Ilium")).toBe(false);
    expect(itemMatches("cycle", "Calvin cycle")).toBe(false);
    expect(itemMatches("Krebs cycle", "Calvin cycle")).toBe(false);
    expect(itemMatches("light reactions", "Light-independent reactions")).toBe(false);
    expect(itemMatches("energy carrier", "Energy carrier molecule")).toBe(true);
    expect(itemMatches("system", "Nervous system")).toBe(false);
  });

  it("gives no credit for writing one fragment on every line", () => {
    expect(gradeListRecall(stages, "phase\nphase\nphase\nphase").score).toBe(0);
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

describe("memory palace helpers", () => {
  it("validates a route: a name and three to thirty named locations", () => {
    const route = (count: number) => Array.from({ length: count }, (_, index) => ({ name: `Place ${index + 1}`, detail: null }));
    expect(palaceInputSchema.safeParse({ title: "My home", locations: route(3) }).success).toBe(true);
    expect(palaceInputSchema.safeParse({ title: "My home", locations: route(2) }).success).toBe(false);
    expect(palaceInputSchema.safeParse({ title: "My home", locations: route(31) }).success).toBe(false);
    expect(palaceInputSchema.safeParse({ title: " ", locations: route(3) }).success).toBe(false);
    expect(palaceInputSchema.safeParse({ title: "x", locations: [...route(2), { name: "  ", detail: null }] }).success).toBe(false);
  });

  it("sizes the walk by time, route and concepts", () => {
    expect(palaceStopCount(15, 20, 20)).toBe(10);
    expect(palaceStopCount(5, 20, 20)).toBe(3);
    expect(palaceStopCount(60, 20, 20)).toBe(12);
    expect(palaceStopCount(15, 4, 20)).toBe(4);
    expect(palaceStopCount(15, 20, 2)).toBe(2);
  });

  it("reads session state and stops defensively", () => {
    expect(palaceStateOf(null)).toEqual({ index: 0, stage: "setup", palaceId: null, palaceTitle: null, placements: [] });
    expect(palaceStateOf({ stage: "walk", palaceId: "p" }).stage).toBe("walk");
    expect(palaceStateOf({ stage: "weird" }).stage).toBe("setup");
    expect(lociViewOf({ stop: 2, location: "Hallway" })).toEqual({ stop: 2, total: 2, location: "Hallway", detail: null, previous: null });
    expect(lociViewOf({ location: "Hallway" })).toBeNull();
    expect(lociResultOf({ result: { concept: "ATP", definition: "", association: "", isCorrect: true, given: "atp" } })?.isCorrect).toBe(true);
    expect(lociResultOf({ result: { concept: "ATP" } })).toBeNull();
  });

  it("treats a location as the same place whatever the case or hyphens", () => {
    expect(sameLocation("Front door", "front  door")).toBe(true);
    expect(sameLocation("Living-room sofa", "living room sofa")).toBe(true);
    expect(sameLocation("Front door", "Back door")).toBe(false);
  });

  it("mock: writes one image per pair that keeps the meaning", () => {
    const { associations } = associationsHeuristically("0. Location: Front door — Concept: ATP — Meaning: The energy currency of the cell.\n1. Location: Hallway — Concept: Chlorophyll — Meaning: A green pigment.");
    expect(associations.map((entry) => entry.index)).toEqual([0, 1]);
    expect(associations[0].association).toMatch(/front door/);
    expect(associations[0].association).toMatch(/ATP/);
    expect(associations[0].association).toMatch(/energy currency of the cell/);
  });
});

describe("story method helpers", () => {
  const story = { title: "Mira and the cycle", facts: ["Fact one", "Fact two", "Fact three"], paragraphs: [{ text: "P1", facts: [1, 9] }, { text: "P2", facts: [3, 3] }], accuracy_note: " " };

  it("keeps only the facts the story carries and renumbers them", () => {
    const tidy = tidyStory(story);
    expect(tidy?.facts).toEqual(["Fact one", "Fact three"]);
    expect(tidy?.paragraphs).toEqual([{ text: "P1", facts: [1] }, { text: "P2", facts: [2] }]);
    expect(tidy?.accuracyNote).toBeNull();
    expect(tidyStory({ ...story, paragraphs: [{ text: "P1", facts: [1] }] })).toBeNull();
    expect(tidyStory({ ...story, paragraphs: [{ text: "P1", facts: [] }] })).toBeNull();
  });

  it("scores a retelling by facts kept and contradictions", () => {
    expect(retellScore([true, true, true, true], 0)).toBe(100);
    expect(retellScore([true, true, false, false], 0)).toBe(50);
    expect(retellScore([true, true, true, true], 2)).toBe(70);
    expect(retellScore([], 0)).toBe(0);
    expect(storyCount(5)).toBe(1);
    expect(storyCount(15)).toBe(2);
    expect(storyCount(45)).toBe(3);
  });

  it("reads a story item and its result defensively", () => {
    expect(storyViewOf({ title: "T", facts: ["a", "b"], paragraphs: [] })).toEqual({ title: "T", facts: ["a", "b"], paragraphs: [], accuracyNote: null });
    expect(storyViewOf({ facts: [] })).toBeNull();
    expect(storyResultOf({ result: { score: 50, isCorrect: false, recalled: [true, false], incorrect: [], feedback: "" } })?.score).toBe(50);
    expect(storyResultOf({ result: { score: "x" } })).toBeNull();
  });

  it("mock: writes one story per section, every fact carried by a paragraph, and checks a retelling fact by fact", () => {
    const transcript = `[Section: Calvin Cycle]
Calvin Cycle
The Calvin cycle is the set of reactions that fixes carbon dioxide into sugar using ATP and NADPH.
It takes place in the stroma of the chloroplast and was discovered in 1950 by Melvin Calvin.`;
    const { stories } = storiesHeuristically(transcript, "Produce exactly 2 stories.");
    expect(stories).toHaveLength(1);
    expect(stories[0].facts).toHaveLength(2);
    expect(stories[0].paragraphs.flatMap((paragraph) => paragraph.facts)).toEqual([1, 2]);
    expect(stories[0].paragraphs[0].text).toContain(stories[0].facts[0]);
    const prompt = (retell: string) => `Story: ${stories[0].title}\nFacts:\n${stories[0].facts.map((fact, index) => `${index + 1}. ${fact}`).join("\n")}\nRetelling:\n"""\n${retell}\n"""`;
    const partial = retellCheckHeuristically(prompt("The Calvin cycle fixes carbon dioxide into sugar using ATP and NADPH."));
    expect(partial.facts).toEqual([{ index: 1, recalled: true }, { index: 2, recalled: false }]);
    expect(partial.incorrect).toEqual([]);
    expect(retellCheckHeuristically(prompt("(blank)")).facts.every((fact) => !fact.recalled)).toBe(true);
    expect(retellCheckHeuristically(prompt("It does not take place in the stroma of the chloroplast, Melvin Calvin discovered it in 1950.")).incorrect).toHaveLength(1);
  });
});
