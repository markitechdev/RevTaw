import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { type QuestionAnswer, type QuestionResponse } from "@/lib/quizzes/types";
import { normalizeText, textMatches } from "@/lib/quizzes/text-match";
import type { QuestionType } from "@/lib/supabase/database.types";

export { normalizeText, textMatches };

/** Share of the points needed for an open answer to count as correct. */
export const CORRECT_THRESHOLD = 0.6;

export type GradeResult = {
  isCorrect: boolean;
  score: number;
  feedback: string | null;
  gradedBy: "auto" | "ai";
};

/** Grades objective question types without AI. Returns null for open types. */
export function gradeObjective(type: QuestionType, answer: QuestionAnswer, response: QuestionResponse | null, points: number): GradeResult | null {
  if (!response) return { isCorrect: false, score: 0, feedback: null, gradedBy: "auto" };
  switch (type) {
    case "multiple_choice": {
      const correct = "option_id" in answer && "option_id" in response && answer.option_id === response.option_id;
      return { isCorrect: correct, score: correct ? points : 0, feedback: null, gradedBy: "auto" };
    }
    case "true_false": {
      const correct = "value" in answer && "value" in response && answer.value === response.value;
      return { isCorrect: correct, score: correct ? points : 0, feedback: null, gradedBy: "auto" };
    }
    case "identification":
    case "fill_blank": {
      const correct = "accepted" in answer && "text" in response && textMatches(response.text, answer.accepted);
      return { isCorrect: correct, score: correct ? points : 0, feedback: null, gradedBy: "auto" };
    }
    default:
      return null;
  }
}

export type OpenAnswerItem = {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  modelAnswer: string;
  rubric: string[];
  studentAnswer: string;
};

const gradingSchema = z.object({
  grades: z
    .array(
      z.object({
        id: z.string().min(1),
        score: z.number().min(0),
        feedback: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1),
});

/**
 * Grades open-ended answers in one model call. Scores are clamped to each
 * question's points; an answer is "correct" at or above CORRECT_THRESHOLD.
 */
export async function gradeOpenAnswers(materialTitle: string, items: OpenAnswerItem[]): Promise<Map<string, GradeResult>> {
  const results = new Map<string, GradeResult>();
  const pending = items.filter((item) => item.studentAnswer.trim());
  for (const item of items) {
    if (!item.studentAnswer.trim()) {
      results.set(item.id, { isCorrect: false, score: 0, feedback: "No answer was given.", gradedBy: "auto" });
    }
  }
  if (pending.length === 0) return results;

  const provider = getAiProvider("strong");
  const system = `You are RevTaw's fair, encouraging grader for a student's quiz on "${materialTitle}".
Grade each answer against the model answer and rubric only — do not reward facts outside them.
Scoring: full points when every rubric point is covered (wording may differ); partial points for partially covered answers; 0 for blank, off-topic or contradicting answers. Use integers.
Feedback: 1-3 sentences, speak to the student directly, name what was right and what was missing. Never reveal unrelated material.
Respond with JSON only: {"grades": [{"id": "...", "score": number, "feedback": "..."}]} with one entry per answer id.`;

  const user = pending
    .map(
      (item, index) => `Answer ${index + 1}
id: ${item.id}
type: ${item.type}
max points: ${item.points}
question: ${item.prompt}
model answer: ${item.modelAnswer}
rubric: ${item.rubric.length ? item.rubric.map((point) => `- ${point}`).join("\n") : "(use the model answer)"}
student answer: ${item.studentAnswer.slice(0, 4000)}`,
    )
    .join("\n\n");

  const result = await generateJson(provider, gradingSchema, {
    task: "grade_answers",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 3000,
    temperature: 0,
  });

  for (const item of pending) {
    const grade = result.data.grades.find((entry) => entry.id === item.id);
    if (!grade) continue;
    const score = Math.max(0, Math.min(item.points, Math.round(grade.score)));
    results.set(item.id, {
      isCorrect: score >= item.points * CORRECT_THRESHOLD,
      score,
      feedback: grade.feedback,
      gradedBy: "ai",
    });
  }
  return results;
}
