import { z } from "zod";

import {
  DEFAULT_QUIZ_CONFIG,
  QUESTION_TYPE_IDS,
  QUESTION_TYPES,
  QUIZ_MAX_QUESTIONS,
  QUIZ_MIN_QUESTIONS,
  type QuestionAnswer,
  type QuestionOption,
  type QuestionResponse,
  type QuizConfig,
} from "@/lib/quizzes/types";
import { assertSameType } from "@/lib/type-assert";

/**
 * Validators for quiz settings and the JSON stored with questions and answers
 * (the shapes and the vocabulary are in `types.ts`). The server validates
 * with these; the quiz dialog loads them only when it opens.
 */

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
  /** Ask "How sure are you?" for every answer (feeds confidence calibration). Older quizzes default to on. */
  askConfidence: z.boolean().default(true),
});
assertSameType<z.output<typeof quizConfigSchema>, QuizConfig>();

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
assertSameType<z.output<typeof optionSchema>, QuestionOption>();

export const answerSchema = z.union([
  z.object({ option_id: z.string().trim().min(1).max(4), rationales: z.record(z.string(), z.string().trim().min(1).max(600)).optional() }),
  z.object({ value: z.boolean(), correction: z.string().trim().min(1).max(1000).optional() }),
  z.object({ accepted: z.array(z.string().trim().min(1).max(300)).min(1).max(12) }),
  z.object({ model_answer: z.string().trim().min(1).max(4000), rubric: z.array(z.string().trim().min(1).max(300)).max(8) }),
]);
assertSameType<z.output<typeof answerSchema>, QuestionAnswer>();

export const responseSchema = z.union([
  z.object({ option_id: z.string().trim().min(1).max(4) }),
  z.object({ value: z.boolean() }),
  z.object({ text: z.string().max(4000) }),
]);
assertSameType<z.output<typeof responseSchema>, QuestionResponse>();
