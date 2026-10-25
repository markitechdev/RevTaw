import { describe, expect, it } from "vitest";

import { needsDeepThinking } from "@/lib/tutor/deep-thinking";

describe("needsDeepThinking", () => {
  it("gives math, code and problems more thinking time, in English, Filipino and Taglish", () => {
    for (const question of [
      "Solve 2x + 3 = 11",
      "What is 15% of 80?",
      "Ano ang 20% ng 150?",
      "Paano i-solve ang 3x - 5 = 10?",
      "Lutasin: 2/3 + 1/4",
      "Find the derivative of x^2 sin x",
      "Prove that the sum of two even numbers is even.",
      "Compute the determinant of [[1, 2], [3, 4]]",
      "A car travels 60 km/h for 2.5 hours. How far does it go?",
      "Kung may 5 mangga si Ana at ibinigay niya ang 2 kay Ben, ilan ang natira?",
      "Calculate the molarity of 5 g NaCl in 250 mL of water",
      "What's the time complexity of binary search?",
      "Debug my Python function, it keeps returning None",
      "Why does this print 5?\n```java\nint x = 5;\nSystem.out.println(x);\n```",
      "SELECT name FROM students WHERE age > 18; what does it return?",
      "What is 12 × 7 - 4?",
      "Explain the Pythagorean theorem with a sample problem",
    ]) {
      expect(needsDeepThinking(question), question).toBe(true);
    }
  });

  it("keeps definitions, explanations and small talk quick", () => {
    for (const question of [
      "What is photosynthesis?",
      "Explain the French Revolution",
      "Summarize chapters 1-3",
      "Ano ang mitosis?",
      "Give me an example",
      "hi",
      "Salamat!",
      "What is a LEFT JOIN?",
      "My exam is on 10/26/2026, what should I review?",
      "How many bones are in the human body?",
      "What are the key factors of World War 2?",
      "Evaluate the impact of colonialism on the Philippines",
      "What is the extracellular matrix?",
      "Explain the theory of evolution",
    ]) {
      expect(needsDeepThinking(question), question).toBe(false);
    }
  });

  it("looks at what a follow-up is about", () => {
    expect(needsDeepThinking("Explain more.", ["What is 2/3 + 1/4?"])).toBe(true);
    expect(needsDeepThinking("Explain more.", [null, "What is osmosis?"])).toBe(false);
  });
});
