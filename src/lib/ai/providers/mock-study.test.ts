import { describe, expect, it } from "vitest";

import { problemEvaluationHeuristically, problemsHeuristically, scenarioEvaluationHeuristically, scenariosHeuristically } from "@/lib/ai/providers/mock-study";

const transcript = `[Section: Photosynthesis Overview]
Photosynthesis Overview
Photosynthesis is the process by which green plants convert light energy into chemical energy.
The overall equation is 6CO2 + 6H2O -> C6H12O6 + 6O2.

[Section: Calvin Cycle]
Calvin Cycle
The Calvin cycle is the set of reactions that fixes carbon dioxide into sugar using ATP and NADPH.
It takes place in the stroma of the chloroplast.`;

describe("mock problem heuristics", () => {
  it("writes worked examples with a similar practice problem and step explanations", () => {
    const { problems } = problemsHeuristically(transcript, "Mode: worked\nProduce exactly 2 problems.");
    expect(problems).toHaveLength(2);
    expect(problems[0].solution.steps.length).toBeGreaterThanOrEqual(3);
    expect(problems[0].solution.steps.every((step) => step.explanation.length > 0)).toBe(true);
    expect(problems[0].practice?.problem).toMatch(/Your turn/);
  });

  it("keeps faded examples as one family of four and honours a fixed difficulty", () => {
    expect(problemsHeuristically(transcript, "Mode: faded\nProduce exactly 4 problems.").problems).toHaveLength(4);
    const hard = problemsHeuristically(transcript, 'Mode: practice\nEvery problem is "hard" difficulty\nProduce exactly 2 problems.');
    expect(hard.problems.every((problem) => problem.difficulty === "hard")).toBe(true);
  });

  it("grades reasoning and the final answer", () => {
    const { problems } = problemsHeuristically(transcript, "Mode: practice\nProduce exactly 1 problems.");
    const problem = problems[0];
    const reference = [...problem.solution.steps.map((step, index) => `Step ${index + 1}: ${step.step} — ${step.explanation}`), `Final answer: ${problem.solution.final_answer}`].join("\n");
    const prompt = (work: string) => `Problem: ${problem.problem}\nReference solution:\n${reference}\nKey points:\n${problem.key_points.map((point) => `- ${point}`).join("\n")}\nStudent work:\n"""\n${work}\n"""`;
    const good = problemEvaluationHeuristically(prompt(`${problem.key_points.join(", ")}. ${problem.solution.final_answer}`));
    expect(good.verdict).toBe("correct");
    expect(good.final_answer_correct).toBe(true);
    const blank = problemEvaluationHeuristically(prompt("(blank)"));
    expect(blank.score).toBe(0);
    expect(blank.verdict).toBe("incorrect");
  });
});

describe("mock scenario heuristics", () => {
  it("moves the best action between positions and grades the justification by its ideas", () => {
    const { scenarios } = scenariosHeuristically(transcript, "Produce exactly 3 scenarios.");
    expect(scenarios).toHaveLength(3);
    expect(new Set(scenarios.map((scenario) => scenario.best_option)).size).toBeGreaterThan(1);
    expect(scenarios.every((scenario) => scenario.option_feedback.length === scenario.options.length)).toBe(true);
    const scenario = scenarios[0];
    const prompt = (justification: string) => `Key points:\n${scenario.key_points.map((point) => `- ${point}`).join("\n")}\nStudent justification:\n"""\n${justification}\n"""`;
    expect(scenarioEvaluationHeuristically(prompt(scenario.key_points.join(" "))).justification_score).toBe(100);
    expect(scenarioEvaluationHeuristically(prompt("(blank)")).justification_score).toBe(0);
  });

});
