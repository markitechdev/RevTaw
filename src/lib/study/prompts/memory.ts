import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { buildTranscript, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import { GROUNDING_RULE, studentLine, text, upTo } from "@/lib/study/prompts/shared";
import { modelTitle } from "@/lib/ai/fields";

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
${upTo(input.count, "targets")}

<material>
${transcript}
</material>`;
  const result = await generateJson(provider, mnemonicSetSchema, { task: "generate_mnemonics", system, messages: [{ role: "user", content: user }], maxTokens: 5000, temperature: 0.6 });
  return { targets: result.data.targets.slice(0, Math.max(1, input.count)), provider: result.raw.provider, model: result.raw.model };
}

export const associationsSchema = z.object({
  associations: z.array(z.object({ index: z.number().int().min(0), association: text(600) })).max(30),
});

/** Method of loci: one vivid image per location that still states what the concept means. */
export async function generateAssociations(input: { materialTitle: string; pairs: Array<{ location: string; concept: string; definition: string }> }): Promise<{ associations: Map<number, string>; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const system = `You are RevTaw's memory-palace guide for "${input.materialTitle}". For each pair, write ONE vivid, slightly exaggerated image that places the concept at the location so it is easy to picture when walking the route — and that still carries what the concept actually means.
- 1-3 sentences, present tense, concrete sensory detail.
- ${ACCURACY_RULE}
Respond with JSON only: { "associations": [{ "index": number, "association": string }] }`;
  const user = input.pairs.map((pair, index) => `${index}. Location: ${pair.location} — Concept: ${pair.concept} — Meaning: ${pair.definition}`).join("\n");
  const result = await generateJson(provider, associationsSchema, { task: "palace_associations", system, messages: [{ role: "user", content: user }], maxTokens: 3000, temperature: 0.7 });
  return { associations: new Map(result.data.associations.map((entry) => [entry.index, entry.association])), provider: result.raw.provider, model: result.raw.model };
}

export const storySetSchema = z.object({
  stories: z
    .array(
      z.object({
        title: modelTitle(),
        concept: text(120),
        facts: z.array(text(400)).min(2).max(10),
        paragraphs: z.array(z.object({ text: text(1500), facts: z.array(z.number().int()).max(10) })).min(1).max(8),
        accuracy_note: z.string().trim().max(400).nullable().optional(),
      }),
    )
    .max(3),
});

export type GeneratedStory = z.infer<typeof storySetSchema>["stories"][number];

/** Story method: related facts woven into one memorable — and academically accurate — story. */
export async function generateStories(input: { materialTitle: string; chunks: AnalysisChunkInput[]; student: StudentContext; count: number }): Promise<{ stories: GeneratedStory[]; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const { transcript } = buildTranscript(input.chunks);
  const system = `You are RevTaw's storyteller. Turn groups of related facts from the material into short, memorable stories that stay academically accurate.

Rules:
- "facts": 3-8 related facts from one part of the material, in the material's words (the "Original Notes").
- "paragraphs": the story, 2-5 short paragraphs; "facts" lists the numbers (1-based) of the facts each paragraph carries. Every fact appears in the story at least once.
- Characters and settings may be invented; the facts may not be changed. ${ACCURACY_RULE}
- "accuracy_note": anything the story simplifies, or null.
- "concept": the 1-4 word concept. ${GROUNDING_RULE}
- Respond with a single JSON object: { "stories": [{ "title": string, "concept": string, "facts": string[], "paragraphs": [{ "text": string, "facts": number[] }], "accuracy_note": string | null }] }`;
  const user = `Material title: ${input.materialTitle}
Student: ${studentLine(input.student)}
${upTo(input.count, "stories")}

<material>
${transcript}
</material>`;
  const result = await generateJson(provider, storySetSchema, { task: "generate_stories", system, messages: [{ role: "user", content: user }], maxTokens: 5000, temperature: 0.7 });
  return { stories: result.data.stories.slice(0, Math.max(1, input.count)), provider: result.raw.provider, model: result.raw.model };
}

export const retellCheckSchema = z.object({
  facts: z.array(z.object({ index: z.number().int(), recalled: z.boolean() })).max(10),
  incorrect: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  feedback: text(800),
});

export type RetellCheck = z.infer<typeof retellCheckSchema>;

/** Checks a retelling fact by fact: which original notes it carries, and what it gets wrong. */
export async function checkRetell(input: { title: string; facts: string[]; retell: string }): Promise<RetellCheck> {
  const provider = getAiProvider("strong");
  const system = `You check a student's retelling of a study story against the original notes. The student retold the story from memory.
- For EACH fact, "recalled": true when the retelling states it in any words, false when it is missing.
- "incorrect": statements in the retelling that contradict the notes. Story decoration — characters, places, events around the facts — is fine; only contradictions of the facts count.
- "feedback": 1-3 encouraging, specific sentences on what to keep and what to add next time.
Respond with JSON only: { "facts": [{ "index": number (1-based), "recalled": boolean }], "incorrect": string[], "feedback": string }`;
  const user = `Story: ${input.title}
Facts:
${input.facts.map((fact, index) => `${index + 1}. ${fact}`).join("\n")}
Retelling:
"""
${input.retell.trim() || "(blank)"}
"""`;
  const result = await generateJson(provider, retellCheckSchema, { task: "story_retell_check", system, messages: [{ role: "user", content: user }], maxTokens: 1500, temperature: 0.1 });
  return result.data;
}
