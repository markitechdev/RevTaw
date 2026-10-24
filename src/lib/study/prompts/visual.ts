import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { buildTranscript, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import { GROUNDING_RULE, studentLine, text } from "@/lib/study/prompts/shared";
import type { Visual, VisualTopic } from "@/lib/study/visuals";
import { modelTitle } from "@/lib/ai/fields";

/**
 * Dual coding (spec §16): the same content as text and as a visual —
 * table, flowchart, timeline, hierarchy (diagram) or concept relationships.
 * The schema is shared with the tutor's "Visualize" action.
 */

const label = text(160);

export const visualSchema: z.ZodType<Visual> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("table"),
    columns: z.array(label).min(2).max(5),
    rows: z.array(z.array(z.string().trim().max(300))).min(1).max(8),
  }),
  z.object({
    type: z.literal("flowchart"),
    steps: z
      .array(z.object({ label, detail: z.string().trim().max(400).nullable().optional() }))
      .min(2)
      .max(8),
  }),
  z.object({
    type: z.literal("timeline"),
    events: z
      .array(z.object({ when: text(60), label, detail: z.string().trim().max(400).nullable().optional() }))
      .min(2)
      .max(8),
  }),
  z.object({
    type: z.literal("hierarchy"),
    root: label,
    children: z
      .array(z.object({ label, children: z.array(z.object({ label })).max(5).optional() }))
      .min(2)
      .max(6),
  }),
  z.object({
    type: z.literal("relationships"),
    nodes: z.array(label).min(2).max(10),
    links: z
      .array(z.object({ from: label, to: label, relation: text(40) }))
      .min(1)
      .max(10),
  }),
]) as z.ZodType<Visual>;

/** Keeps a validated visual internally consistent (rows as wide as the header, links between known nodes). */
export function tidyVisual(visual: Visual): Visual {
  switch (visual.type) {
    case "table":
      return { ...visual, rows: visual.rows.map((row) => visual.columns.map((_, index) => row[index] ?? "")) };
    case "relationships": {
      const nodes = [...new Set([...visual.nodes, ...visual.links.flatMap((link) => [link.from, link.to])])].slice(0, 12);
      return { ...visual, nodes, links: visual.links.filter((link) => nodes.includes(link.from) && nodes.includes(link.to) && link.from !== link.to) };
    }
    default:
      return visual;
  }
}

export const visualSetSchema = z.object({
  topics: z
    .array(z.object({ title: modelTitle(), concept: text(120), text: text(1500), visual: visualSchema }))
    .min(1)
    .max(6),
});

export const VISUAL_RULES = `Choose the visual that fits the content: a process or sequence → "flowchart"; dates or eras → "timeline"; things compared on the same attributes → "table"; categories, parts or types → "hierarchy" (a root with children and optional grandchildren); causes, requirements and dependencies → "relationships" (nodes and labeled links such as causes, requires, leads to, contains, depends on, is an example of).
Keep visuals small and readable: at most 8 steps or events, a table of at most 5 columns and 6 rows, a hierarchy of at most 3 levels, at most 8 links. Labels are short; details carry the rest.`;

export async function generateVisualSet(input: { materialTitle: string; chunks: AnalysisChunkInput[]; student: StudentContext; count: number }): Promise<{ topics: VisualTopic[]; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const { transcript } = buildTranscript(input.chunks);
  const system = `You are RevTaw's dual-coding designer. For each important topic of the material you write a concise text explanation AND a visual of the same content, so the student can study it in words, in a picture, or both.

Rules:
- ${VISUAL_RULES}
- Use different visual types across topics when the content allows it.
- "text": 2-5 sentences that say what the visual shows. "concept": the 1-4 word concept.
- ${GROUNDING_RULE}
- Respond with a single JSON object matching the schema. No commentary.`;
  const user = `Material title: ${input.materialTitle}
Student: ${studentLine(input.student)}
Produce exactly ${input.count} topics.

JSON schema: { "topics": [{ "title": string, "concept": string, "text": string, "visual": { "type": "table", "columns": string[], "rows": string[][] } | { "type": "flowchart", "steps": [{ "label": string, "detail": string }] } | { "type": "timeline", "events": [{ "when": string, "label": string, "detail": string }] } | { "type": "hierarchy", "root": string, "children": [{ "label": string, "children": [{ "label": string }] }] } | { "type": "relationships", "nodes": string[], "links": [{ "from": string, "to": string, "relation": string }] } }] }

<material>
${transcript}
</material>`;
  const result = await generateJson(provider, visualSetSchema, { task: "generate_visuals", system, messages: [{ role: "user", content: user }], maxTokens: 7000, temperature: 0.3 });
  return { topics: result.data.topics.slice(0, Math.max(1, input.count)).map((topic) => ({ ...topic, visual: tidyVisual(topic.visual) })), provider: result.raw.provider, model: result.raw.model };
}
