import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { GROUNDING_RULE, points, text } from "@/lib/study/prompts/shared";

/**
 * Prompts behind guided SQ3R reading (spec §16): model answers for the
 * student's own questions, grounded in the section they were written for.
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
  const provider = getAiProvider("fast");
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
