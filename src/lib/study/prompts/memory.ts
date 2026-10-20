import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { buildTranscript, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import { GROUNDING_RULE, studentLine, text } from "@/lib/study/prompts/shared";

/**
 * Prompts behind the memory techniques (spec §16). Memorable, but never at
 * the cost of accuracy: every fact must survive the device unchanged.
 */

const ACCURACY_RULE = "Memory devices must be ACCURATE: never change, add or drop a fact to make a device work; if a device would distort the material, choose another kind.";

export const mnemonicSetSchema = z.object({
  targets: z
    .array(
      z.object({
        target: text(200),
        items: z.array(text(200)).min(2).max(10),
        ordered: z.boolean().default(true),
        concept: text(120),
        options: z
          .array(z.object({ kind: z.enum(["acronym", "acrostic", "rhyme", "phrase", "association", "story"]), content: text(1500), explanation: text(1500) }))
          .min(1)
          .max(3),
      }),
    )
    .min(1)
    .max(5),
});

export type MnemonicTarget = z.infer<typeof mnemonicSetSchema>["targets"][number];

export async function generateMnemonics(input: { materialTitle: string; chunks: AnalysisChunkInput[]; student: StudentContext; count: number }): Promise<{ targets: MnemonicTarget[]; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const { transcript } = buildTranscript(input.chunks);
  const system = `You are RevTaw's memory coach. Find the parts of the material that are hard to memorize — lists, ordered steps, groups of terms, sequences — and write mnemonics for them.

Rules:
- "target": what the student must remember ("The stages of mitosis, in order"). "items": the facts or list items, in the material's order and words.
- "ordered": true when the order matters (steps, stages, sequences), false for an unordered group.
- "options": 2-3 different kinds — "acronym" (the first letters of the items, in order, spell a word; put that word in "content"), "acrostic" (a sentence whose words start with those letters, in order), "rhyme", "phrase" (a memorable phrase), "association" (a vivid link to something familiar), "story" (a tiny educational story).
- "explanation": how the device maps back to every item, one by one.
- ${ACCURACY_RULE}
- "concept": the 1-4 word concept.
- ${GROUNDING_RULE}
- Respond with a single JSON object: { "targets": [{ "target": string, "items": string[], "ordered": boolean, "concept": string, "options": [{ "kind": string, "content": string, "explanation": string }] }] }`;
  const user = `Material title: ${input.materialTitle}
Student: ${studentLine(input.student)}
Produce exactly ${input.count} targets.

<material>
${transcript}
</material>`;
  const result = await generateJson(provider, mnemonicSetSchema, { task: "generate_mnemonics", system, messages: [{ role: "user", content: user }], maxTokens: 5000, temperature: 0.6 });
  return { targets: result.data.targets.slice(0, Math.max(1, input.count)), provider: result.raw.provider, model: result.raw.model };
}
