import { describe, expect, it } from "vitest";

import { mentions, pickSectionIndices } from "@/lib/study/sections";

const topics = ["Cell structure", "Mitosis", "Meiosis", "Photosynthesis: the light reactions", "The Calvin cycle", "Cellular respiration", "Genetics", "Ecology"];

describe("which sections a session works through", () => {
  it("finds a concept by name, as a whole word", () => {
    expect(mentions("The Calvin cycle fixes carbon.", "calvin cycle")).toBe(true);
    expect(mentions("Fotosíntesis y respiración", "fotosintesis")).toBe(true);
    expect(mentions("An excellent result", "cell")).toBe(false);
    expect(mentions("Na and K", "Na")).toBe(false);
  });

  it("starts with the sections about the concepts a plan names", () => {
    expect(pickSectionIndices(topics, 2, { focus: ["Calvin cycle", "Genetics"] })).toEqual([4, 6]);
    // Fewer matches than wanted: the sections after the first match fill in.
    expect(pickSectionIndices(topics, 3, { focus: ["meiosis"] })).toEqual([2, 3, 4]);
    // Names that match nothing fall back to the usual order.
    expect(pickSectionIndices(topics, 2, { focus: ["Thermodynamics"] })).toEqual([0, 1]);
  });

  it("picks up after the sections done before, and starts over once all are done", () => {
    expect(pickSectionIndices(topics, 3)).toEqual([0, 1, 2]);
    expect(pickSectionIndices(topics, 3, { done: new Set([0, 1, 2]) })).toEqual([3, 4, 5]);
    expect(pickSectionIndices(topics, 3, { done: new Set([0, 1, 2, 3, 4, 5]) })).toEqual([6, 7, 0]);
    expect(pickSectionIndices(topics, 3, { done: new Set([0, 1, 2, 3, 4, 5, 6, 7]) })).toEqual([0, 1, 2]);
    expect(pickSectionIndices(topics, 20)).toHaveLength(topics.length);
    expect(pickSectionIndices([], 3)).toEqual([]);
  });
});
