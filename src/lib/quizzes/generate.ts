import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { buildTranscript, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import { EDUCATION_LEVEL_LABEL, STUDY_GOAL_LABEL } from "@/lib/profile/options";
import { distributeQuestions, optionSchema, QUESTION_TYPE_BY_ID, QUESTION_TYPE_IDS, type QuizConfig } from "@/lib/quizzes/types";
import type { QuestionDifficulty, QuestionType } from "@/lib/supabase/database.types";

const text = (max: number) => z.string().trim().min(1).max(max);

const baseQuestion = {
  difficulty: z.enum(["easy", "medium", "hard"]),
  prompt: text(4000),
  explanation: text(4000),
  concept: text(120),
  source_excerpt: z.string().trim().max(1000).default(""),
};

const generatedQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("multiple_choice"),
    ...baseQuestion,
    options: z.array(optionSchema).min(3).max(6),
    answer: z.object({ option_id: z.string().trim().min(1).max(4) }),
  }),
  z.object({
    type: z.literal("true_false"),
    ...baseQuestion,
    answer: z.object({ value: z.boolean() }),
  }),
  z.object({
    type: z.literal("identification"),
    ...baseQuestion,
    answer: z.object({ accepted: z.array(text(300)).min(1).max(12) }),
  }),
  z.object({
    type: z.literal("fill_blank"),
    ...baseQuestion,
    answer: z.object({ accepted: z.array(text(300)).min(1).max(12) }),
  }),
  ...(["short_answer", "essay", "scenario", "case_based", "problem_solving"] as const).map((type) =>
    z.object({
      type: z.literal(type),
      ...baseQuestion,
      answer: z.object({ model_answer: text(4000), rubric: z.array(text(300)).max(8).default([]) }),
    }),
  ),
]);

export const quizResponseSchema = z.object({
  title: text(160),
  questions: z.array(generatedQuestionSchema).min(1).max(60),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
export type QuizResponse = z.infer<typeof quizResponseSchema>;

export type AdaptiveTargets = {
  /** Per-concept target difficulty from the mastery model. */
  targets: Array<{ concept: string; difficulty: "easy" | "medium" | "hard" | "advanced" }>;
  /** Concepts that should get a larger share of questions. */
  focusConcepts: string[];
};

export type GenerateQuizResult = {
  title: string;
  questions: GeneratedQuestion[];
  provider: string;
  model: string;
  coverageRatio: number;
};

const TYPE_RULES: Record<QuestionType, string> = {
  multiple_choice:
    'exactly four options with ids "a"-"d"; one correct; distractors must be plausible (related terms, common confusions) but clearly wrong according to the material; "answer": {"option_id": "a"}',
  true_false:
    'a single declarative statement; roughly half false, made false by changing one specific detail; "answer": {"value": true}',
  identification:
    'describe a term, person, process or idea and ask for its name; "answer": {"accepted": ["canonical name", "acceptable variants"]}',
  fill_blank:
    'a sentence from the material with one key word or phrase replaced by "____"; "answer": {"accepted": ["missing phrase", "variants"]}',
  short_answer:
    'answerable in 1-2 sentences; "answer": {"model_answer": "...", "rubric": ["point the answer must contain", ...]}',
  essay:
    'asks to explain or compare, answerable in one paragraph; "answer": {"model_answer": "...", "rubric": ["required point", ...]}',
  scenario:
    'presents a realistic situation and asks the student to apply the material; "answer": {"model_answer": "...", "rubric": [...]}',
  case_based:
    'presents a short case with details and asks for an analysis or decision with justification; "answer": {"model_answer": "...", "rubric": [...]}',
  problem_solving:
    'poses a problem that must be worked out step by step (numbers, formulas or procedures from the material); "answer": {"model_answer": "steps and final answer", "rubric": [...]}',
};

function studentLine(student: StudentContext): string {
  return (
    [
      student.educationLevel ? `education level: ${EDUCATION_LEVEL_LABEL[student.educationLevel]}` : null,
      student.mainGoal ? `main goal: ${STUDY_GOAL_LABEL[student.mainGoal]}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "not specified"
  );
}

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Validates and tidies the model output: drops duplicates and questions whose
 * answer does not fit their type, then trims to the requested count.
 */
export function finalizeQuestions(questions: GeneratedQuestion[], config: QuizConfig): GeneratedQuestion[] {
  const seen = new Set<string>();
  const kept: GeneratedQuestion[] = [];
  for (const question of questions) {
    const key = normalizePrompt(question.prompt);
    if (!key || seen.has(key)) continue;
    if (question.type === "multiple_choice") {
      const ids = question.options.map((option) => option.id.toLowerCase());
      if (new Set(ids).size !== ids.length) continue;
      if (!ids.includes(question.answer.option_id.toLowerCase())) continue;
      question.options = question.options.map((option) => ({ ...option, id: option.id.toLowerCase() }));
      question.answer = { option_id: question.answer.option_id.toLowerCase() };
    }
    if (question.type === "fill_blank" && !/_{2,}/.test(question.prompt)) continue;
    seen.add(key);
    kept.push(question);
  }
  const wanted = new Set(config.questionTypes);
  const matching = kept.filter((question) => wanted.has(question.type));
  const pool = matching.length >= Math.min(config.questionCount, 3) ? matching : kept;
  return pool.slice(0, config.questionCount);
}

/** Generates quiz questions of the configured types from the material chunks. */
export async function generateQuiz(
  materialTitle: string,
  chunks: AnalysisChunkInput[],
  config: QuizConfig,
  student: StudentContext,
  adaptive: AdaptiveTargets | null = null,
): Promise<GenerateQuizResult> {
  const provider = getAiProvider("strong");
  const { transcript, coverageRatio } = buildTranscript(chunks);
  const plan = distributeQuestions(config.questionCount, config.questionTypes);
  const difficulty: QuestionDifficulty | "mixed" | "adaptive" = config.difficulty;
  const difficultyRule =
    difficulty === "adaptive"
      ? adaptive && adaptive.targets.length
        ? `adaptive — use these per-concept targets (advanced = hard with no hints or scaffolding): ${adaptive.targets.map((target) => `${target.concept}: ${target.difficulty}`).join("; ")}; concepts without a target: medium`
        : "spread easy, medium and hard across the set (no history yet for this material)"
      : difficulty === "mixed"
        ? "spread easy, medium and hard across the set"
        : `"${difficulty}" for every question`;

  const system = `You are RevTaw's quiz writer. You write exam-quality questions strictly from a student's uploaded material.

Question type rules:
${QUESTION_TYPE_IDS.filter((type) => config.questionTypes.includes(type))
  .map((type) => `- ${type} (${QUESTION_TYPE_BY_ID[type].name}): ${TYPE_RULES[type]}`)
  .join("\n")}

Quality rules:
- Every question must be answerable from the material alone; the correct answer must be explicitly supported by it. Never invent facts.
- No duplicate or near-duplicate questions; cover different parts of the material. No trivia about formatting or page numbers.
- Questions must be unambiguous with exactly one defensible answer (or one model answer for open types).
- "explanation": 1-3 sentences on why the answer is correct, citing the material in plain words.
- "concept": the 1-4 word concept the question tests (reuse the same wording for the same concept).
- "source_excerpt": a short verbatim quote (max 300 chars) from the material that supports the answer.
- "difficulty": ${difficultyRule}.
${adaptive?.focusConcepts.length ? `- Give about 40% of the questions to these concepts the student struggles with: ${adaptive.focusConcepts.join(", ")}; cover the rest of the material with the remainder.` : ""}
- Keep the material's language and terminology. Write for a student, clearly.
- Respond with a single JSON object matching the schema. No commentary.`;

  const user = `Material title: ${materialTitle}
Student: ${studentLine(student)}
${config.focus ? `Focus only on this topic/chapter if the material covers it: ${config.focus}\n` : ""}${coverageRatio < 1 ? `Note: only the first ${Math.round(coverageRatio * 100)}% of the material is included; cover what you can see.\n` : ""}
Plan (produce exactly these counts, ${config.questionCount} questions in total):
${plan.map((item) => `- ${item.type}: ${item.count}`).join("\n")}

JSON schema:
{
  "title": string (max 160, e.g. "${materialTitle} — Practice Quiz"),
  "questions": [
    {
      "type": one of ${config.questionTypes.map((type) => `"${type}"`).join(", ")},
      "difficulty": "easy" | "medium" | "hard",
      "prompt": string,
      "options": [{"id": "a", "text": "..."}, ...] (multiple_choice only, exactly four),
      "answer": object as described in the type rules,
      "explanation": string,
      "concept": string,
      "source_excerpt": string
    }
  ]
}

<material>
${transcript}
</material>`;

  const result = await generateJson(provider, quizResponseSchema, {
    task: "generate_quiz",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 8000,
    temperature: 0.4,
  });

  return {
    title: result.data.title.slice(0, 160),
    questions: finalizeQuestions(result.data.questions, config),
    provider: result.raw.provider,
    model: result.raw.model,
    coverageRatio,
  };
}
