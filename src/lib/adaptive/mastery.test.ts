import { describe, expect, it } from "vitest";

import { isWeakTopic, MASTERY_SPACING_DAYS, MASTERY_THRESHOLD, needsRefresh, NEXT_STEP_LABEL, STATUS_BANDS, STATUS_LABEL } from "@/lib/adaptive/mastery";
import { CONCEPT_STATES } from "@/lib/engine/types";

describe("mastery labels", () => {
  it("names every state, with Developing between Learning and Strong", () => {
    expect(CONCEPT_STATES.map((state) => STATUS_LABEL[state])).toEqual(["Not started", "Needs foundation", "Learning", "Developing", "Strong", "Mastered"]);
    expect(MASTERY_THRESHOLD).toBe(90);
    expect(STATUS_BANDS).toContain("Developing 60–79");
    expect(STATUS_BANDS).toContain("Mastered ≥ 90");
  });

  it("words each next step the way its gate works", () => {
    // The spacing gate needs a right answer at least this many days after the first one, not just the next day.
    expect(MASTERY_SPACING_DAYS).toBe(2);
    expect(NEXT_STEP_LABEL.spaced).toBe("Get it right again 2 or more days after the first time");
    expect(NEXT_STEP_LABEL.hardItem).toMatch(/hard question.*without choices/);
  });

  it("calls a topic weak on evidence, not on a low number alone", () => {
    const row = { attempts: 6, first_attempts: 6, status: "learning" as const, weakness: 0.1, misconceptions: 0 };
    expect(isWeakTopic({ ...row, attempts: 0, first_attempts: 0 })).toBe(false);
    // One or two answers are still being measured, however they went.
    expect(isWeakTopic({ ...row, attempts: 2, first_attempts: 2, weakness: 0.3 })).toBe(false);
    expect(isWeakTopic({ ...row, weakness: 0.3 })).toBe(true);
    expect(isWeakTopic({ ...row, status: "weak" })).toBe(true);
    // A confident wrong answer is worth fixing from the first one.
    expect(isWeakTopic({ ...row, attempts: 1, first_attempts: 1, misconceptions: 1 })).toBe(true);
    // Under 60% only because recall faded: a refresh, not a weak topic.
    expect(isWeakTopic({ ...row, weakness: 0.05 })).toBe(false);
  });

  it("shows a faded strong or mastered concept as a refresh", () => {
    expect(needsRefresh({ status: "developing", best_status: "mastered", recall: 0.7 })).toBe(true);
    expect(needsRefresh({ status: "mastered", best_status: "mastered", recall: 0.95 })).toBe(false);
    expect(needsRefresh({ status: "learning", best_status: "developing", recall: 0.5 })).toBe(false);
    // Dropped for another reason (a new confident mistake) while recall is still fresh.
    expect(needsRefresh({ status: "developing", best_status: "strong", recall: 0.97 })).toBe(false);
  });
});
