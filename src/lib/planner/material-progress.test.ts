import { describe, expect, it } from "vitest";

import { coveredMastery, materialGoalProgress, masteryWords, partlyPracticed } from "@/lib/planner/material-progress";

describe("material progress", () => {
  it("counts the concepts not practiced yet as 0", () => {
    // One concept of thirty at 95%: about 3% of the material shown, not 95%.
    expect(coveredMastery(95, { practiced: 1, total: 30 })).toBeCloseTo(3.17, 2);
    expect(coveredMastery(60, { practiced: 30, total: 30 })).toBe(60);
    expect(coveredMastery(null, { practiced: 0, total: 30 })).toBeNull();
    // Without the material's concept list, the practiced average stands.
    expect(coveredMastery(80, null)).toBe(80);
  });

  it("can assume a planning estimate for the concepts not practiced yet", () => {
    expect(coveredMastery(95, { practiced: 1, total: 30 }, 55)).toBeCloseTo((95 + 55 * 29) / 30, 6);
    expect(coveredMastery(40, { practiced: 4, total: 4 }, 55)).toBe(40);
  });

  it("says how much is practiced while some concepts aren't", () => {
    expect(partlyPracticed({ practiced: 1, total: 8 })).toBe(true);
    expect(partlyPracticed({ practiced: 8, total: 8 })).toBe(false);
    expect(partlyPracticed(null)).toBe(false);
    expect(masteryWords(59.4, { practiced: 1, total: 8 })).toBe("1 of 8 concepts practiced, 59% on those");
    expect(masteryWords(72.6, { practiced: 8, total: 8 })).toBe("73% mastery");
    expect(masteryWords(72.6, null)).toBe("73% mastery");
    expect(masteryWords(null, { practiced: 0, total: 8 })).toBeNull();
  });

  it("measures a mastery goal over every concept of the material", () => {
    // One concept of eight at 95%: 12%, not a reached "Reach 50% mastery".
    expect(materialGoalProgress("mastery", [95], { practiced: 1, total: 8 })).toEqual({ current: 12, detail: "12%: 1 of 8 concepts practiced, 95% on those" });
    expect(materialGoalProgress("mastery", [70, 90], { practiced: 2, total: 2 })).toEqual({ current: 80, detail: "80% average over 2 concepts" });
    expect(materialGoalProgress("mastery", [], { practiced: 0, total: 8 })).toEqual({ current: 0, detail: "No concepts practiced yet" });
  });

  it("finishes a material only when every concept is at 60% or more", () => {
    // Three strong concepts of a material of ten: not finished.
    expect(materialGoalProgress("finish_material", [80, 75, 90], { practiced: 3, total: 10 })).toEqual({ current: 0, detail: "3 of 10 concepts at 60% or more" });
    expect(materialGoalProgress("finish_material", [80, 75, 90, 61], { practiced: 4, total: 4 })).toEqual({ current: 1, detail: "4 of 4 concepts at 60% or more" });
    expect(materialGoalProgress("finish_material", [80, 59, 90], { practiced: 3, total: 3 }).current).toBe(0);
    // A material whose analysis lists two key concepts is finished with both; without a list, two practiced aren't enough.
    expect(materialGoalProgress("finish_material", [80, 90], { practiced: 2, total: 2 }).current).toBe(1);
    expect(materialGoalProgress("finish_material", [80, 90], { practiced: 2, total: 2 }, false).current).toBe(0);
    expect(materialGoalProgress("finish_material", [80, 90, 70], { practiced: 3, total: 3 }, false).current).toBe(1);
    expect(materialGoalProgress("finish_material", [], null)).toEqual({ current: 0, detail: "Not started" });
  });
});
