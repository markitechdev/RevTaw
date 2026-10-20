import { z } from "zod";

import type { ConfidenceLevel, QuestionDifficulty, QuestionType, QuizMode } from "@/lib/supabase/database.types";

/**
 * Shared quiz vocabulary (safe for client and server): the question type
 * catalog, the quiz configuration schema and the JSON shapes stored in
 * `quiz_questions.answer` / `quiz_answers.response`.
 */

export type QuestionTypeInfo = {
  id: QuestionType;
  name: string;
  description: string;
  /** Objective types are graded by the server; open types by the AI (or the student). */
  grading: "auto" | "ai";
  points: number;
};

export const QUESTION_TYPES: readonly QuestionTypeInfo[] = [
  { id: "multiple_choice", name: "Multiple choice", description: "One correct option among four plausible choices.", grading: "auto", points: 1 },
  { id: "true_false", name: "True / False", description: "Decide whether a statement from the material is true.", grading: "auto", points: 1 },
  { id: "identification", name: "Identification", description: "Name the term, process or idea being described.", grading: "auto", points: 1 },
  { id: "fill_blank", name: "Fill in the blank", description: "Complete the missing word or phrase in a sentence.", grading: "auto", points: 1 },
  { id: "short_answer", name: "Short answer", description: "Answer in one or two sentences, graded against a model answer.", grading: "ai", points: 2 },
  { id: "essay", name: "Essay", description: "Explain in a paragraph, graded with a short rubric.", grading: "ai", points: 3 },
  { id: "scenario", name: "Scenario", description: "Apply the material to a realistic situation.", grading: "ai", points: 3 },
  { id: "case_based", name: "Case-based", description: "Analyse a short case and justify a decision.", grading: "ai", points: 3 },
  { id: "problem_solving", name: "Problem solving", description: "Work through a problem step by step to a final answer.", grading: "ai", points: 3 },
] as const;

export const QUESTION_TYPE_IDS = QUESTION_TYPES.map((type) => type.id) as [QuestionType, ...QuestionType[]];

export const QUESTION_TYPE_BY_ID: Record<QuestionType, QuestionTypeInfo> = Object.fromEntries(
  QUESTION_TYPES.map((type) => [type.id, type]),
) as Record<QuestionType, QuestionTypeInfo>;

export const DIFFICULTY_LABEL: Record<QuestionDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const QUIZ_MODE_LABEL: Record<QuizMode, string> = {
  practice: "Practice",
  exam: "Exam",
};

export const CONFIDENCE_LEVELS: ReadonlyArray<{ id: ConfidenceLevel; label: string }> = [
  { id: "guessing", label: "Guessing" },
  { id: "unsure", label: "Unsure" },
  { id: "somewhat_confident", label: "Fairly sure" },
  { id: "very_confident", label: "Certain" },
];

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = Object.fromEntries(
  CONFIDENCE_LEVELS.map((level) => [level.id, level.label]),
) as Record<ConfidenceLevel, string>;

export const QUIZ_MIN_QUESTIONS = 3;
export const QUIZ_MAX_QUESTIONS = 50;
export const QUIZ_PRESET_COUNTS = [5, 10, 20, 50] as const;

/** Settings chosen when a quiz is generated; stored in `quizzes.config`. */
export const quizConfigSchema = z.object({
  questionTypes: z.array(z.enum(QUESTION_TYPE_IDS)).min(1, "Choose at least one question type.").max(QUESTION_TYPES.length),
  questionCount: z.number().int().min(QUIZ_MIN_QUESTIONS).max(QUIZ_MAX_QUESTIONS),
  difficulty: z.enum(["easy", "medium", "hard", "mixed", "adaptive"]),
  mode: z.enum(["practice", "exam"]),
  timeLimitMinutes: z.number().int().min(1).max(240).nullable(),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  feedback: z.enum(["immediate", "after"]),
  /** Optional topic or chapter to focus on (free text, matched by the model). */
  focus: z.string().trim().max(200).nullable(),
});

export type QuizConfig = z.infer<typeof quizConfigSchema>;

export const DEFAULT_QUIZ_CONFIG: QuizConfig = {
  questionTypes: ["multiple_choice", "true_false", "identification"],
  questionCount: 10,
  difficulty: "adaptive",
  mode: "practice",
  timeLimitMinutes: null,
  shuffleQuestions: true,
  shuffleOptions: true,
  feedback: "immediate",
  focus: null,
};

/** Reads a stored config, filling anything missing with defaults. */
export function parseQuizConfig(value: unknown): QuizConfig {
  const parsed = quizConfigSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const partial = (value && typeof value === "object" ? value : {}) as Partial<QuizConfig>;
  return { ...DEFAULT_QUIZ_CONFIG, ...partial, questionTypes: DEFAULT_QUIZ_CONFIG.questionTypes };
}

export const optionSchema = z.object({
  id: z.string().trim().min(1).max(4),
  text: z.string().trim().min(1).max(500),
});
export type QuestionOption = z.infer<typeof optionSchema>;

export const answerSchema = z.union([
  z.object({ option_id: z.string().trim().min(1).max(4) }),
  z.object({ value: z.boolean() }),
  z.object({ accepted: z.array(z.string().trim().min(1).max(300)).min(1).max(12) }),
  z.object({ model_answer: z.string().trim().min(1).max(4000), rubric: z.array(z.string().trim().min(1).max(300)).max(8) }),
]);
export type QuestionAnswer = z.infer<typeof answerSchema>;

export const responseSchema = z.union([
  z.object({ option_id: z.string().trim().min(1).max(4) }),
  z.object({ value: z.boolean() }),
  z.object({ text: z.string().max(4000) }),
]);
export type QuestionResponse = z.infer<typeof responseSchema>;

export function isObjectiveType(type: QuestionType): boolean {
  return QUESTION_TYPE_BY_ID[type].grading === "auto";
}

/** Splits a question budget across the chosen types as evenly as possible. */
export function distributeQuestions(count: number, types: QuestionType[]): Array<{ type: QuestionType; count: number }> {
  const unique = [...new Set(types)];
  const base = Math.floor(count / unique.length);
  let remainder = count - base * unique.length;
  return unique.map((type) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { type, count: base + extra };
  }).filter((item) => item.count > 0);
}

/** Default time limit for exam mode: a minute per question, at least five minutes. */
export function defaultExamMinutes(questionCount: number): number {
  return Math.max(5, questionCount);
}

/** Human-readable form of a stored correct answer (results, mistakes, feedback). */
export function describeAnswer(answer: QuestionAnswer, options: QuestionOption[] | null): string {
  if ("option_id" in answer) {
    const option = options?.find((item) => item.id === answer.option_id);
    return option ? `${option.id.toUpperCase()}. ${option.text}` : answer.option_id.toUpperCase();
  }
  if ("value" in answer) return answer.value ? "True" : "False";
  if ("accepted" in answer) return answer.accepted[0] ?? "";
  return answer.model_answer;
}

/** Human-readable form of a student's response. */
export function describeResponse(response: QuestionResponse | null, options: QuestionOption[] | null): string | null {
  if (!response) return null;
  if ("option_id" in response) {
    const option = options?.find((item) => item.id === response.option_id);
    return option ? `${option.id.toUpperCase()}. ${option.text}` : response.option_id.toUpperCase();
  }
  if ("value" in response) return response.value ? "True" : "False";
  return response.text.trim() || null;
}
