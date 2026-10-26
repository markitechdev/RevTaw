import { describe, expect, it } from "vitest";

import { caseEvaluationHeuristically, casesHeuristically, problemEvaluationHeuristically, problemsHeuristically, readingAnswersHeuristically, reflectQuestionsHeuristically, scenarioEvaluationHeuristically, scenariosHeuristically } from "@/lib/ai/providers/mock-study";

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
    expect(good.score).toBeGreaterThanOrEqual(80);
    expect(good.final_answer_correct).toBe(true);
    const blank = problemEvaluationHeuristically(prompt("(blank)"));
    expect(blank.score).toBe(0);
  });
});

describe("mock scenario and case heuristics", () => {
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

  it("writes a case with an expert analysis and scores each field", () => {
    const { cases } = casesHeuristically(transcript, "Produce exactly 1 cases.");
    const model = cases[0].model;
    expect(model.evidence.length).toBeGreaterThan(0);
    const expert = `Expert analysis:\nProblem: ${model.problem}\nEvidence: ${model.evidence.join("; ")}\nPossible solutions: ${model.solutions.join("; ")}\nBest solution: ${model.best_solution}\nJustification: ${model.justification}`;
    const full = caseEvaluationHeuristically(`${expert}\nStudent analysis:\nProblem: ${model.problem}\nEvidence: ${model.evidence.join("; ")}\nPossible solutions: ${model.solutions.join("; ")}\nBest solution: ${model.best_solution}\nJustification: ${model.justification}`);
    expect(full.overall).toBe(100);
    const partial = caseEvaluationHeuristically(`${expert}\nStudent analysis:\nProblem: ${model.problem}\nEvidence: (blank)\nPossible solutions: (blank)\nBest solution: (blank)\nJustification: (blank)`);
    expect(partial.fields.problem.score).toBe(100);
    expect(partial.fields.evidence.score).toBe(0);
    expect(partial.overall).toBe(25);
  });
});

describe("mock guided-reading heuristics", () => {
  const sections = `[Section 1: Photosynthesis Overview]\nPhotosynthesis is the process by which green plants convert light energy into chemical energy.\n\n[Section 2: Calvin Cycle]\nThe Calvin cycle is the set of reactions that fixes carbon dioxide into sugar using ATP and NADPH. It takes place in the stroma.`;

  it("answers each question from its own section", () => {
    const { answers } = readingAnswersHeuristically(sections, "0. (Section 2) Where does the Calvin cycle take place?\n1. (Section 1) What is photosynthesis?");
    expect(answers).toHaveLength(2);
    expect(answers[0].model_answer).toMatch(/stroma/);
    expect(answers[1].model_answer).toMatch(/light energy/);
    expect(answers.every((answer) => answer.covered)).toBe(true);
  });

  it("asks conceptual reflect questions of mixed kinds", () => {
    const { questions } = reflectQuestionsHeuristically(sections, "Produce exactly 2 questions.");
    expect(questions.map((question) => question.kind)).toEqual(["why", "how"]);
    expect(questions[0].prompt).toMatch(/^Why does/);
  });
});
