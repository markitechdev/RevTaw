import { describe, expect, it } from "vitest";

import { countsAsCorrect, PASS_SCORE, scenarioVerdict, VERDICT_LABEL, verdictFor } from "@/lib/study/verdict";

describe("the score → verdict rule", () => {
  it("labels an answer correct exactly when it is stored as correct, for every pass score", () => {
    for (const passAt of Object.values(PASS_SCORE)) {
      for (let score = 0; score <= 100; score += 1) {
        expect(countsAsCorrect(verdictFor(score, passAt)), `score ${score} at pass ${passAt}`).toBe(score >= passAt);
      }
    }
  });

  it("names the bands plainly", () => {
    expect([95, 72, 45, 10].map((score) => VERDICT_LABEL[verdictFor(score)])).toEqual(["Correct", "Mostly right", "Partly there", "Not yet"]);
    // A Feynman explanation needs 70: 65% is not yet counted, and says so.
    expect(verdictFor(65, PASS_SCORE.feynman)).toBe("partial");
    // A rebuilt list needs 80: there is no "mostly right" band below it.
    expect(verdictFor(79, PASS_SCORE.list)).toBe("partial");
    expect(verdictFor(80, PASS_SCORE.list)).toBe("correct");
  });

  it("judges a scenario by the choice first, then the justification", () => {
    expect(scenarioVerdict({ isCorrect: true, correctChoice: true, score: 92 })).toBe("correct");
    expect(scenarioVerdict({ isCorrect: true, correctChoice: true, score: 78 })).toBe("mostly");
    expect(scenarioVerdict({ isCorrect: false, correctChoice: true, score: 68 })).toBe("partial");
    expect(scenarioVerdict({ isCorrect: false, correctChoice: false, score: 38 })).toBe("incorrect");
  });
});
