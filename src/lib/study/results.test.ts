import { describe, expect, it } from "vitest";

import { recallResultOf, ungradedOf, withUngraded } from "@/lib/study/results";

const checked = { score: 72, verdict: "mostly", correct_points: ["light energy"], missing_points: [], incorrect_points: [], feedback: "Good." };

describe("stored study answers", () => {
  it("reads a checked recall answer, an unchecked one and an unanswered one", () => {
    const base = { model_answer: "Chlorophyll absorbs red and blue light.", source_excerpt: null };
    expect(recallResultOf({ ...base, answered_at: "2026-10-24T10:00:00Z", analysis: checked, is_correct: true })).toMatchObject({ comparison: { score: 72 }, isCorrect: true, ungraded: null });
    const unchecked = withUngraded({ section: 1 }, { mistake: { question: "Q", correctAnswer: "A", explanation: "" } });
    expect(recallResultOf({ ...base, answered_at: "2026-10-24T10:00:00Z", analysis: unchecked, is_correct: null })).toMatchObject({ comparison: null, isCorrect: null, ungraded: { selfCheck: null } });
    expect(recallResultOf({ ...base, answered_at: null, analysis: { section: 1 }, is_correct: null })).toBeNull();
  });

  it("keeps the student's mark and ignores anything malformed", () => {
    expect(ungradedOf({ ungraded: { selfCheck: "correct", mistake: null, retestedMistakeId: "m1" } })).toEqual({ selfCheck: "correct", mistake: null, retestedMistakeId: "m1" });
    expect(ungradedOf({ ungraded: { selfCheck: "maybe", mistake: "x" } })).toEqual({ selfCheck: null, mistake: null, retestedMistakeId: null });
    expect(ungradedOf(checked)).toBeNull();
    expect(ungradedOf(null)).toBeNull();
  });
});
