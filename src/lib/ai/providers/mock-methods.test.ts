import { describe, expect, it } from "vitest";

import { blurtCompareHeuristically, chunkHeuristically, questionEvaluationHeuristically, recallQuestionsHeuristically } from "@/lib/ai/providers/mock";

const transcript = `[Section: Photosynthesis Overview]
Photosynthesis Overview
Photosynthesis is the process by which green plants convert light energy into chemical energy.
The overall equation is 6CO2 + 6H2O -> C6H12O6 + 6O2.

[Section: Calvin Cycle]
Calvin Cycle
The Calvin cycle is the set of reactions that fixes carbon dioxide into sugar using ATP and NADPH.
It takes place in the stroma of the chloroplast.`;

describe("mock study-method heuristics", () => {
  it("rotates retrieval formats and writes a fill-in-the-blank with the term as the answer", () => {
    const { questions } = recallQuestionsHeuristically(transcript, "Formats to rotate: fill_blank, definition, list\nProduce exactly 3 prompts.");
    expect(questions.map((question) => question.format)).toEqual(["fill_blank", "definition", "list"]);
    expect(questions[0].prompt).toMatch(/^Fill in the blank: .*____/);
    expect(questions[0].key_points).toEqual([questions[0].model_answer]);
    expect(questions[1].prompt).toMatch(/^Define /);
  });

  it("scores a blurt by the key ideas it covers and lists what was forgotten", () => {
    const prompt = `Section: Calvin Cycle
Key points:
- Calvin cycle
- ATP
- stroma
Source:
"""
The Calvin cycle fixes carbon dioxide into sugar using ATP and NADPH. It takes place in the stroma.
"""
Student blurt (attempt 1):
"""
The Calvin cycle uses ATP.
"""`;
    const result = blurtCompareHeuristically(prompt);
    expect(result.remembered).toEqual(["Calvin cycle", "ATP"]);
    expect(result.missing).toEqual(["stroma"]);
    expect(result.score).toBe(67);
    const blank = blurtCompareHeuristically(prompt.replace("The Calvin cycle uses ATP.", "(blank)"));
    expect(blank.score).toBe(0);
    expect(blank.remembered).toEqual([]);
  });

  it("chunks one section at a time with a recall question", () => {
    const { chunks } = chunkHeuristically(transcript, "Produce about 4 chunks.");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].title).toBe("Photosynthesis Overview");
    expect(chunks[1].recall_question).toMatch(/Calvin cycle/);
    expect(chunks[1].details.length).toBeGreaterThan(0);
  });

  it("rates a relevant question above an off-topic one", () => {
    const material = `[Passage 1 — Calvin Cycle]\nThe Calvin cycle is the set of reactions that fixes carbon dioxide into sugar using ATP and NADPH.`;
    const good = questionEvaluationHeuristically(material, "Student's question: Why does the Calvin cycle need ATP and NADPH to fix carbon dioxide?\nExpected answer: It uses ATP and NADPH to fix carbon dioxide into sugar.");
    const bad = questionEvaluationHeuristically(material, "Student's question: who won\nExpected answer: (not given)");
    expect(good.relevance).toBeGreaterThan(bad.relevance);
    expect(good.overall).toBeGreaterThan(bad.overall);
    expect(good.difficulty).toBe("hard");
  });
});
