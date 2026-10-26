import { describe, expect, it } from "vitest";

import { isReadingMethod, READING_STAGE_LABEL, READING_STAGES, readReadingState, suggestQuestion } from "@/lib/study/reading-options";

describe("guided reading", () => {
  it("has SQ3R's five stages and PQ4R's six, with Reflect only in PQ4R", () => {
    expect(READING_STAGES.sq3r).toEqual(["survey", "question", "read", "recite", "review"]);
    expect(READING_STAGES.pq4r).toEqual(["survey", "question", "read", "reflect", "recite", "review"]);
  });

  it("runs Cornell notes as notes, cues, recite with the notes covered, then a summary", () => {
    expect(READING_STAGES.cornell_notes).toEqual(["notes", "question", "recite", "review"]);
    expect(READING_STAGE_LABEL.cornell_notes.question).toBe("Cues");
    expect(READING_STAGE_LABEL.cornell_notes.review).toBe("Summary");
    expect(isReadingMethod("cornell_notes")).toBe(true);
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
    expect(state?.notes).toEqual([]);
    expect(readReadingState({ stage: "notes", sections: [{ heading: "A", text: "x" }], notes: ["Mine", 4] })?.notes).toEqual(["Mine", ""]);
  });
});
