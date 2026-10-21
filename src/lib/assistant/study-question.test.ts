import { describe, expect, it } from "vitest";

import { asksAboutStudyData } from "@/lib/assistant/study-question";

describe("asksAboutStudyData", () => {
  it("spots questions about the student's own study data in English, Filipino and Taglish", () => {
    for (const question of [
      "What topics am I weak at?",
      "Tamari, what should I study today?",
      "What should I review first?",
      "Ano ang dapat kong aralin ngayon?",
      "Anong dapat kong i-review?",
      "How is my exam prep going?",
      "Saan ako mahina?",
      "Show my mistakes",
      "When is my next exam?",
    ]) {
      expect(asksAboutStudyData(question), question).toBe(true);
    }
  });

  it("leaves ordinary questions alone, so they stay small", () => {
    for (const question of ["Explain recursion", "Quiz me about Chapter 3", "What is the Calvin cycle?", "Explain mo sakin yung recursion", "Give me an example"]) {
      expect(asksAboutStudyData(question), question).toBe(false);
    }
  });
});
