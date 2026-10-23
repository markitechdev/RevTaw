import { describe, expect, it } from "vitest";

import { MASTERY_THRESHOLD, needsRefresh, STATUS_BANDS, STATUS_LABEL } from "@/lib/adaptive/mastery";
import { CONCEPT_STATES } from "@/lib/engine/types";

describe("mastery labels", () => {
  it("names every state, with Developing between Learning and Strong", () => {
    expect(CONCEPT_STATES.map((state) => STATUS_LABEL[state])).toEqual(["Not started", "Needs foundation", "Learning", "Developing", "Strong", "Mastered"]);
    expect(MASTERY_THRESHOLD).toBe(90);
    expect(STATUS_BANDS).toContain("Developing 60–79");
    expect(STATUS_BANDS).toContain("Mastered ≥ 90");
  });

  it("shows a faded strong or mastered concept as a refresh", () => {
    expect(needsRefresh({ status: "developing", best_status: "mastered", recall: 0.7 })).toBe(true);
    expect(needsRefresh({ status: "mastered", best_status: "mastered", recall: 0.95 })).toBe(false);
    expect(needsRefresh({ status: "learning", best_status: "developing", recall: 0.5 })).toBe(false);
    // Dropped for another reason (a new confident mistake) while recall is still fresh.
    expect(needsRefresh({ status: "developing", best_status: "strong", recall: 0.97 })).toBe(false);
  });
});
