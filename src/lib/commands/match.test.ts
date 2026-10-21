import { describe, expect, it } from "vitest";

import { matchRange, matchScore } from "@/lib/commands/match";

describe("command matching", () => {
  it("ranks a label prefix above a word prefix above a substring above a keyword", () => {
    expect(matchScore("Quiz", undefined, "qui")).toBe(3);
    expect(matchScore("Create a reviewer", undefined, "rev")).toBe(2);
    expect(matchScore("Flashcards", undefined, "card")).toBe(1);
    expect(matchScore("Create a quiz", "test practice", "test")).toBe(0.5);
    expect(matchScore("Planner", "calendar", "zzz")).toBe(0);
  });

  it("needs every word of a multi-word query", () => {
    expect(matchScore("Start Smart Study", "plan session", "smart study")).toBe(2);
    expect(matchScore("Start Smart Study", "plan session", "smart quiz")).toBe(0);
    expect(matchScore("Upload material", "add file pdf", "upload pdf")).toBe(0.5);
  });

  it("ignores case, accents and extra spaces", () => {
    expect(matchScore("Español notes", undefined, "  ESPAN ")).toBe(3);
    expect(matchScore("Ask RevTaw", undefined, "ask   rev")).toBe(3);
  });

  it("returns the highlighted range", () => {
    expect(matchRange("Flashcards", "card")).toEqual([5, 9]);
    expect(matchRange("Flashcards", "zzz")).toBeNull();
    expect(matchRange("Flashcards", "  ")).toBeNull();
  });
});
