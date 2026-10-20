import { describe, expect, it } from "vitest";

import { fadeFormat, fadeLabel, fadeSchedule, givenStepCount, readSolution } from "@/lib/study/problem-options";

describe("faded worked examples", () => {
  it("follows the 90% → 70% → 40% → independent schedule", () => {
    expect(fadeSchedule(4)).toEqual([0.9, 0.7, 0.4, 0]);
    expect(fadeSchedule(3)).toEqual([0.9, 0.4, 0]);
    expect(fadeSchedule(1)).toEqual([0]);
    expect(fadeSchedule(4).map(fadeFormat)).toEqual(["faded_90", "faded_70", "faded_40", "independent"]);
    expect(fadeLabel("faded_70")).toBe("70% solved");
    expect(fadeLabel("independent")).toBe("On your own");
  });

  it("always leaves the student a step and gives strictly less help each time", () => {
    let share = 1;
    const given = [0.9, 0.7, 0.4, 0].map((level) => {
      const count = givenStepCount(4, level, share);
      share = count / 4;
      return count;
    });
    expect(given).toEqual([3, 2, 1, 0]);
    expect(givenStepCount(1, 0.9)).toBe(0);
    expect(givenStepCount(6, 0.9)).toBe(5);
  });

  it("reads a stored solution and rejects other text", () => {
    const solution = readSolution(JSON.stringify({ steps: [{ step: "Add", explanation: "Sum rule" }], final_answer: "4", alternative_approach: null }));
    expect(solution?.steps).toHaveLength(1);
    expect(solution?.final_answer).toBe("4");
    expect(readSolution("Step 1: add")).toBeNull();
  });
});
