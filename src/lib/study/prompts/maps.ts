import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { buildTranscript, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import type { MindMapData } from "@/lib/study/maps";
import { GROUNDING_RULE, studentLine, text } from "@/lib/study/prompts/shared";

/** Prompts behind mind mapping (spec §16). */

const leaf = z.object({ label: text(120), note: z.string().trim().max(400).nullable().optional() });

export const mindMapResponseSchema = z.object({
  root: text(120),
  branches: z
    .array(leaf.extend({ children: z.array(leaf.extend({ children: z.array(leaf).max(4).optional() })).max(6).optional() }))
    .min(2)
    .max(8),
  links: z.array(z.object({ from: text(120), to: text(120), label: z.string().trim().max(60).nullable().optional() })).max(8).optional(),
});

/** Flattens the nested model output into the stored node list (ids n1…). */
export function toMindMap(response: z.infer<typeof mindMapResponseSchema>): MindMapData {
  const nodes: MindMapData["nodes"] = [{ id: "n1", label: response.root, note: null, parentId: null }];
  const byLabel = new Map<string, string>([[response.root.toLowerCase(), "n1"]]);
  const add = (entry: { label: string; note?: string | null }, parentId: string) => {
    const id = `n${nodes.length + 1}`;
    nodes.push({ id, label: entry.label, note: entry.note ?? null, parentId });
    if (!byLabel.has(entry.label.toLowerCase())) byLabel.set(entry.label.toLowerCase(), id);
    return id;
  };
  for (const branch of response.branches) {
    const branchId = add(branch, "n1");
    for (const child of branch.children ?? []) {
      const childId = add(child, branchId);
      for (const grandchild of child.children ?? []) add(grandchild, childId);
    }
  }
  const links = (response.links ?? [])
    .map((link, index) => ({ id: `l${index + 1}`, from: byLabel.get(link.from.toLowerCase()) ?? "", to: byLabel.get(link.to.toLowerCase()) ?? "", label: link.label ?? null }))
    .filter((link) => link.from && link.to && link.from !== link.to);
  return { nodes: nodes.slice(0, 120), links };
}

export async function generateMindMap(input: { materialTitle: string; chunks: AnalysisChunkInput[]; student: StudentContext }): Promise<{ map: MindMapData; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const { transcript } = buildTranscript(input.chunks);
  const system = `You are RevTaw's mind-map designer. Build a hierarchical mind map of the material for a student.

Rules:
- "root": the central topic. "branches": 3-7 main topics in the material's order; each with 2-5 "children" (subtopics, key terms) and optional "children" of their own (details) — at most three levels below the root.
- Labels are short (1-6 words); put a one-sentence explanation in "note" where it helps.
- "links": up to 5 cross-links between labels in different branches that the material connects, with a short "label" (e.g. "uses", "produces").
- ${GROUNDING_RULE}
- Respond with a single JSON object: { "root": string, "branches": [{ "label": string, "note": string | null, "children": [{ "label": string, "note": string | null, "children": [{ "label": string }] }] }], "links": [{ "from": string, "to": string, "label": string }] }`;
  const user = `Material title: ${input.materialTitle}
Student: ${studentLine(input.student)}

<material>
${transcript}
</material>`;
  const result = await generateJson(provider, mindMapResponseSchema, { task: "generate_mind_map", system, messages: [{ role: "user", content: user }], maxTokens: 5000, temperature: 0.3 });
  return { map: toMindMap(result.data), provider: result.raw.provider, model: result.raw.model };
}
