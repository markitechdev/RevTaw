import { describe, expect, it } from "vitest";

import { choiceComparison, cleanChoices, isTrueFalse, retestClears, retestOutcomeOf, retestViewFor, retestViewOf } from "@/lib/mistakes/retest";

describe("cleanChoices", () => {
  it("keeps 2–8 distinct, non-empty options in order", () => {
    expect(cleanChoices([" Oxygen ", "Glucose", "oxygen", "", 4, "Water"])).toEqual(["Oxygen", "Glucose", "Water"]);
  });

  it("is null without enough options, or with too many", () => {
    expect(cleanChoices(["Only one"])).toBeNull();
    expect(cleanChoices(Array.from({ length: 9 }, (_, index) => `Option ${index}`))).toBeNull();
    expect(cleanChoices(null)).toBeNull();
    expect(cleanChoices({ a: "Oxygen" })).toBeNull();
  });
});

describe("retestViewFor", () => {
  const choices = ["Oxygen", "Glucose", "Carbon dioxide", "Water"];

  it("retests by picking when the right answer is one of the choices", () => {
    expect(retestViewFor({ choices, context: null, correct_answer: "carbon  dioxide" })).toEqual({ choices, context: null });
  });

  it("lists the choices with the question when the right answer isn't one of them", () => {
    const view = retestViewFor({ choices, context: "A leaf in the sun.", correct_answer: "Carbon dioxide, because…" });
    expect(view.choices).toBeNull();
    expect(view.context).toBe("A leaf in the sun.\n\nOptions:\n- Oxygen\n- Glucose\n- Carbon dioxide\n- Water");
  });

  it("keeps the context of a question without choices", () => {
    expect(retestViewFor({ choices: null, context: "  The case text.  ", correct_answer: "Problem: …" })).toEqual({ choices: null, context: "The case text." });
    expect(retestViewFor({ choices: null, context: "   ", correct_answer: "x" })).toEqual({ choices: null, context: null });
  });

  it("is read back from the item's analysis", () => {
    expect(retestViewOf({ retest: { choices, context: "Case" }, score: 50 })).toEqual({ choices, context: "Case" });
    expect(retestViewOf({ retest: { choices: ["Only"] } })).toEqual({ choices: null, context: null });
    expect(retestViewOf(null)).toEqual({ choices: null, context: null });
  });
});

describe("choiceComparison", () => {
  it("is right only for the right choice, case and spacing aside", () => {
    const right = choiceComparison("carbon dioxide ", "Carbon dioxide");
    expect(right.score).toBe(100);
    expect(right.verdict).toBe("correct");
    expect(right.correct_points).toEqual(["Carbon dioxide"]);
  });

  it("names the wrong pick and the right answer", () => {
    const wrong = choiceComparison("Oxygen", "Carbon dioxide");
    expect(wrong.score).toBe(0);
    expect(wrong.verdict).toBe("incorrect");
    expect(wrong.incorrect_points).toEqual(["Oxygen"]);
    expect(wrong.missing_points).toEqual(["Carbon dioxide"]);
    expect(wrong.feedback).toContain("Carbon dioxide");
  });

  it("counts no pick as missed, without a wrong point", () => {
    const blank = choiceComparison("  ", "True");
    expect(blank.verdict).toBe("incorrect");
    expect(blank.incorrect_points).toEqual([]);
  });
});

describe("retestClears", () => {
  it("clears only on a later day than the miss", () => {
    expect(retestClears("2026-10-26T01:00:00Z", new Date("2026-10-26T20:00:00Z"), "UTC")).toBe(false);
    expect(retestClears("2026-10-25T23:00:00Z", new Date("2026-10-26T00:30:00Z"), "UTC")).toBe(true);
  });

  it("goes by the student's calendar day (Manila when it isn't set)", () => {
    // 15:30 UTC is 23:30 in Manila; 16:30 UTC is 00:30 the next day there, the same day in UTC.
    expect(retestClears("2026-10-26T15:30:00Z", new Date("2026-10-26T16:30:00Z"), "Asia/Manila")).toBe(true);
    expect(retestClears("2026-10-26T15:30:00Z", new Date("2026-10-26T16:30:00Z"), null)).toBe(true);
    expect(retestClears("2026-10-26T15:30:00Z", new Date("2026-10-26T16:30:00Z"), "UTC")).toBe(false);
  });
});

describe("isTrueFalse", () => {
  it("is true only for True then False", () => {
    expect(isTrueFalse(["True", "False"])).toBe(true);
    expect(isTrueFalse(["False", "True"])).toBe(false);
    expect(isTrueFalse(["True", "False", "Maybe"])).toBe(false);
    expect(isTrueFalse(null)).toBe(false);
  });
});

describe("retestOutcomeOf", () => {
  it("reads a stored outcome and ignores anything else", () => {
    expect(retestOutcomeOf({ retestOutcome: "kept" })).toBe("kept");
    expect(retestOutcomeOf({ retestOutcome: "learned" })).toBeNull();
    expect(retestOutcomeOf([])).toBeNull();
  });
});
