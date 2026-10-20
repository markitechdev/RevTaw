import { describe, expect, it } from "vitest";

import { READING_STAGES, readReadingState, suggestQuestion } from "@/lib/study/reading-options";

describe("guided reading", () => {
  it("has SQ3R's five stages", () => {
    expect(READING_STAGES.sq3r).toEqual(["survey", "question", "read", "recite", "review"]);
  });

  it("turns headings into questions", () => {
    expect(suggestQuestion("Calvin Cycle")).toBe("What is Calvin Cycle?");
    expect(suggestQuestion("Chapter 2: Light Reactions", 1)).toBe("How does Light Reactions work?");
    expect(suggestQuestion("Enzymes", 2)).toBe("Why does Enzymes matter?");
  });

  it("reads a stored state defensively", () => {
    expect(readReadingState(null)).toBeNull();
    const state = readReadingState({ stage: "read", sections: [{ heading: "A", text: "x" }, { heading: 3 }], readSections: [0, "1"] });
    expect(state?.sections).toHaveLength(1);
    expect(state?.readSections).toEqual([0]);
    expect(state?.survey.concepts).toEqual([]);
  });
});
