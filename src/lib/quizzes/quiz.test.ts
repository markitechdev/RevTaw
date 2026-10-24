import { describe, expect, it } from "vitest";

import { gradeHeuristically, quizHeuristically } from "@/lib/ai/providers/mock";
import { finalizeQuestions, quizResponseSchema } from "@/lib/quizzes/generate";
import { gradeObjective, normalizeText, textMatches } from "@/lib/quizzes/grade";
import { parseQuizConfig } from "@/lib/quizzes/schemas";
import { DEFAULT_QUIZ_CONFIG, describeAnswer, distributeQuestions, typeCoverageError, type QuizConfig } from "@/lib/quizzes/types";

describe("distributeQuestions", () => {
  it("splits the count evenly and gives the remainder to the first types", () => {
    expect(distributeQuestions(10, ["multiple_choice", "true_false", "identification"])).toEqual([
      { type: "multiple_choice", count: 4 },
      { type: "true_false", count: 3 },
      { type: "identification", count: 3 },
    ]);
  });

  it("drops duplicates and never produces zero-count entries", () => {
    expect(distributeQuestions(2, ["essay", "essay", "scenario", "case_based"])).toEqual([
      { type: "essay", count: 1 },
      { type: "scenario", count: 1 },
    ]);
  });
});

describe("text grading", () => {
  it("normalizes case, accents, punctuation and articles", () => {
    expect(normalizeText("  The Calvin Cycle! ")).toBe("calvin cycle");
    expect(normalizeText("Chlorophyll-a")).toBe("chlorophyll-a");
  });

  it("accepts lenient matches and numbers", () => {
    expect(textMatches("the calvin cycle", ["Calvin cycle"])).toBe(true);
    expect(textMatches("arrays", ["array"])).toBe(true);
    expect(textMatches("1,950", ["1950"])).toBe(true);
    expect(textMatches("stroma", ["thylakoid"])).toBe(false);
    expect(textMatches("", ["anything"])).toBe(false);
  });

  it("grades objective types and leaves open types to the AI", () => {
    expect(gradeObjective("multiple_choice", { option_id: "b" }, { option_id: "b" }, 1)).toMatchObject({ isCorrect: true, score: 1 });
    expect(gradeObjective("true_false", { value: false }, { value: true }, 1)).toMatchObject({ isCorrect: false, score: 0 });
    expect(gradeObjective("fill_blank", { accepted: ["ATP"] }, { text: "atp." }, 1)).toMatchObject({ isCorrect: true });
    expect(gradeObjective("identification", { accepted: ["ATP"] }, null, 1)).toMatchObject({ isCorrect: false, score: 0 });
    expect(gradeObjective("essay", { model_answer: "x", rubric: [] }, { text: "y" }, 3)).toBeNull();
  });
});

describe("quiz config", () => {
  it("falls back to defaults for malformed stored configs", () => {
    expect(parseQuizConfig(null)).toEqual(DEFAULT_QUIZ_CONFIG);
    expect(parseQuizConfig({ questionCount: 7, questionTypes: ["bogus"] })).toMatchObject({ questionCount: 7, questionTypes: DEFAULT_QUIZ_CONFIG.questionTypes });
  });

  it("describes stored answers for results and the mistake notebook", () => {
    expect(describeAnswer({ option_id: "c" }, [{ id: "c", text: "Stroma" }])).toBe("C. Stroma");
    expect(describeAnswer({ value: true }, null)).toBe("True");
    expect(describeAnswer({ accepted: ["ATP", "adenosine triphosphate"] }, null)).toBe("ATP");
  });
});

describe("finalizeQuestions", () => {
  it("removes duplicates, broken multiple choice items and blank-less fill-ins, then trims to the count", () => {
    const config: QuizConfig = { ...DEFAULT_QUIZ_CONFIG, questionCount: 2, questionTypes: ["multiple_choice", "fill_blank"] };
    const base = { difficulty: "easy" as const, explanation: "Because.", concept: "Photosynthesis", source_excerpt: "" };
    const questions = quizResponseSchema.parse({
      title: "Test",
      questions: [
        { type: "multiple_choice", ...base, prompt: "Q1?", options: [{ id: "A", text: "x" }, { id: "b", text: "y" }, { id: "c", text: "z" }], answer: { option_id: "A" } },
        { type: "multiple_choice", ...base, prompt: "q1 ?", options: [{ id: "a", text: "x" }, { id: "b", text: "y" }, { id: "c", text: "z" }], answer: { option_id: "a" } },
        { type: "multiple_choice", ...base, prompt: "Q2?", options: [{ id: "a", text: "x" }, { id: "b", text: "y" }, { id: "c", text: "z" }], answer: { option_id: "d" } },
        { type: "fill_blank", ...base, prompt: "No blank here", answer: { accepted: ["x"] } },
        { type: "fill_blank", ...base, prompt: "The ____ cycle", answer: { accepted: ["Calvin"] } },
        { type: "fill_blank", ...base, prompt: "Another ____", answer: { accepted: ["one"] } },
      ],
    }).questions;
    const kept = finalizeQuestions(questions, config);
    expect(kept.map((question) => question.prompt)).toEqual(["Q1?", "The ____ cycle"]);
    expect(kept[0].type === "multiple_choice" && kept[0].answer.option_id).toBe("a");
  });
});

const TRANSCRIPT = `[Section: Photosynthesis Overview]
Photosynthesis is the process by which green plants convert light energy into chemical energy.
The overall equation is 6CO2 + 6H2O -> C6H12O6 + 6O2.
[Section: Light-Dependent Reactions]
These reactions occur in the thylakoid membranes and produce ATP and NADPH.
Chlorophyll is a pigment that absorbs light most strongly in the blue and red wavelengths.
[Section: Calvin Cycle]
The Calvin cycle is the set of reactions that fixes carbon dioxide into sugar using ATP and NADPH.
It takes place in the stroma of the chloroplast and was discovered in 1950 by Melvin Calvin.`;

describe("mock quiz generation", () => {
  it("follows the plan and produces schema-valid questions of each type", () => {
    const prompt = `Material title: Photosynthesis
Plan (produce exactly these counts, 9 questions in total):
- multiple_choice: 2
- true_false: 2
- identification: 1
- fill_blank: 1
- short_answer: 1
- essay: 1
- problem_solving: 1`;
    const result = quizResponseSchema.parse(quizHeuristically(TRANSCRIPT, prompt));
    expect(result.questions).toHaveLength(9);
    const types = result.questions.map((question) => question.type);
    expect(types.filter((type) => type === "multiple_choice")).toHaveLength(2);
    expect(types).toContain("problem_solving");
    const multipleChoice = result.questions.find((question) => question.type === "multiple_choice");
    expect(multipleChoice?.type === "multiple_choice" && multipleChoice.options).toHaveLength(4);
    expect(multipleChoice?.type === "multiple_choice" && multipleChoice.options.some((option) => option.id === multipleChoice.answer.option_id)).toBe(true);
    const fill = result.questions.find((question) => question.type === "fill_blank");
    expect(fill?.prompt).toContain("____");
    expect(finalizeQuestions(result.questions, { ...DEFAULT_QUIZ_CONFIG, questionCount: 9, questionTypes: [...new Set(types)] })).toHaveLength(9);
  });

  it("grades open answers by overlap with the model answer", () => {
    const prompt = `Answer 1
id: q1
type: short_answer
max points: 2
question: What is photosynthesis?
model answer: Photosynthesis is the process by which green plants convert light energy into chemical energy.
rubric: - Mentions light
- Mentions chemical
student answer: Plants convert light energy into chemical energy.

Answer 2
id: q2
type: essay
max points: 3
question: Explain the Calvin cycle.
model answer: The Calvin cycle fixes carbon dioxide into sugar using ATP and NADPH.
rubric: (use the model answer)
student answer: I do not know.`;
    const { grades } = gradeHeuristically(prompt);
    expect(grades).toHaveLength(2);
    expect(grades[0]).toMatchObject({ id: "q1", score: 2 });
    expect(grades[1]).toMatchObject({ id: "q2", score: 0 });
  });
});

describe("mixed quizzes keep every selected type", () => {
  const question = (type: "multiple_choice" | "true_false" | "identification", index: number) =>
    type === "multiple_choice"
      ? { type, difficulty: "easy" as const, prompt: `Which option ${index}?`, options: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }, { id: "d", text: "D" }], answer: { option_id: "a" }, explanation: "Because.", concept: "Topic", source_excerpt: "Quote." }
      : type === "true_false"
        ? { type, difficulty: "easy" as const, prompt: `Is statement ${index} true?`, answer: { value: true }, explanation: "Because.", concept: "Topic", source_excerpt: "Quote." }
        : { type, difficulty: "easy" as const, prompt: `Name thing ${index}.`, answer: { accepted: ["Thing"] }, explanation: "Because.", concept: "Topic", source_excerpt: "Quote." };

  it("takes each type's share even when the model front-loads one type", () => {
    const generated = [
      ...Array.from({ length: 8 }, (_, index) => question("multiple_choice", index)),
      question("true_false", 1),
      question("true_false", 2),
      question("identification", 1),
      question("identification", 2),
    ];
    const config: QuizConfig = { ...DEFAULT_QUIZ_CONFIG, questionCount: 6, questionTypes: ["multiple_choice", "true_false", "identification"] };
    const final = finalizeQuestions(generated as never, config);
    expect(final).toHaveLength(6);
    expect(final.filter((item) => item.type === "multiple_choice")).toHaveLength(2);
    expect(final.filter((item) => item.type === "true_false")).toHaveLength(2);
    expect(final.filter((item) => item.type === "identification")).toHaveLength(2);
  });

  it("asks for at least one question per selected type", () => {
    expect(typeCoverageError({ questionCount: 3, questionTypes: ["multiple_choice", "true_false", "essay", "scenario"] })).toMatch(/4 question types need at least 4 questions/);
    expect(typeCoverageError({ questionCount: 4, questionTypes: ["multiple_choice", "true_false", "essay", "scenario"] })).toBeNull();
  });
});
