import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { GROUNDING_RULE, points, text } from "@/lib/study/prompts/shared";

/**
 * Prompts behind the guided reading methods SQ3R and PQ4R (spec §16): model
 * answers for the student's own questions (grounded in the section they were
 * written for) and the conceptual questions of PQ4R's Reflect stage.
 */

export type ReadingSection = { heading: string; text: string };

export const readingAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        index: z.number().int().min(0),
        covered: z.boolean().catch(true),
        model_answer: text(2000),
        key_points: points,
      }),
    )
    .max(30),
});

export type ReadingAnswer = z.infer<typeof readingAnswersSchema>["answers"][number];

function sectionsBlock(sections: ReadingSection[]): string {
  return sections.map((section, index) => `[Section ${index + 1}: ${section.heading}]\n${section.text.slice(0, 6000)}`).join("\n\n");
}

/** Answers each of the student's questions from the section it belongs to. */
export async function answerReadingQuestions(input: { materialTitle: string; sections: ReadingSection[]; questions: Array<{ section: number; question: string }> }): Promise<{ answers: ReadingAnswer[]; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const system = `You are RevTaw's reading coach for "${input.materialTitle}". The student turned the section headings into questions before reading. Answer each question from ITS section only.
- "index": the question's number from the list (starting at 0).
- "covered": false when the section does not answer the question; then "model_answer" says what the section does say instead.
- "model_answer": 1-3 sentences in the material's words. "key_points": 2-4 points a good answer contains.
- ${GROUNDING_RULE}
Respond with JSON only: { "answers": [{ "index": number, "covered": boolean, "model_answer": string, "key_points": string[] }] }`;
  const user = `Questions:
${input.questions.map((entry, index) => `${index}. (Section ${entry.section + 1}) ${entry.question}`).join("\n")}

<material>
${sectionsBlock(input.sections)}
</material>`;
  const result = await generateJson(provider, readingAnswersSchema, { task: "reading_answers", system, messages: [{ role: "user", content: user }], maxTokens: 4000, temperature: 0 });
  return { answers: result.data.answers, provider: result.raw.provider, model: result.raw.model };
}

export const REFLECT_KINDS = ["why", "how", "what_if", "connect"] as const;

export const reflectQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        kind: z.enum(REFLECT_KINDS).catch("why"),
        prompt: text(600),
        model_answer: text(2000),
        key_points: points,
        concept: text(120),
      }),
    )
    .min(1)
    .max(6),
});

export type ReflectQuestion = z.infer<typeof reflectQuestionsSchema>["questions"][number];

/** PQ4R's Reflect stage: conceptual questions — why, how, what if, how does it connect. */
export async function generateReflectQuestions(input: { materialTitle: string; sections: ReadingSection[]; count: number }): Promise<{ questions: ReflectQuestion[]; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const system = `You are RevTaw's reflection coach. After reading, the student reflects on the material with CONCEPTUAL questions — not recall of isolated facts.
- Mix the kinds: "why" (why is this true / why does it happen), "how" (how does it work), "what_if" (what changes if a condition changes), "connect" (how does it relate to another idea in the material or to everyday experience).
- "model_answer": the reasoning the material supports, 2-4 sentences. "key_points": 2-4 ideas a good answer contains. "concept": the 1-4 word concept.
- ${GROUNDING_RULE}
Respond with JSON only: { "questions": [{ "kind": string, "prompt": string, "model_answer": string, "key_points": string[], "concept": string }] }`;
  const user = `Material title: ${input.materialTitle}
Produce exactly ${input.count} questions.

<material>
${sectionsBlock(input.sections)}
</material>`;
  const result = await generateJson(provider, reflectQuestionsSchema, { task: "reflect_questions", system, messages: [{ role: "user", content: user }], maxTokens: 3000, temperature: 0.3 });
  return { questions: result.data.questions.slice(0, Math.max(1, input.count)), provider: result.raw.provider, model: result.raw.model };
}
