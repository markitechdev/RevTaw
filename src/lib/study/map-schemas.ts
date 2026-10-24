import { z } from "zod";

import { CONCEPT_RELATIONS, type ConceptMapData, type MindLink, type MindMapData, type MindNode } from "@/lib/study/maps";
import { assertSameType } from "@/lib/type-assert";

/** Validation for saved mind maps and concept maps (server side; the shapes are in `maps.ts`). */

const label = z.string().trim().min(1).max(120);

export const mindNodeSchema = z.object({
  id: z.string().min(1).max(40),
  label,
  note: z.string().trim().max(400).nullable().optional(),
  parentId: z.string().min(1).max(40).nullable(),
  collapsed: z.boolean().optional(),
});

export const mindLinkSchema = z.object({ id: z.string().min(1).max(40), from: z.string().min(1).max(40), to: z.string().min(1).max(40), label: z.string().trim().max(60).nullable().optional() });

export const mindMapSchema = z
  .object({ nodes: z.array(mindNodeSchema).min(1).max(120), links: z.array(mindLinkSchema).max(40).default([]) })
  .superRefine((map, context) => {
    const ids = new Set(map.nodes.map((node) => node.id));
    if (ids.size !== map.nodes.length) context.addIssue({ code: "custom", message: "Duplicate node ids." });
    const roots = map.nodes.filter((node) => node.parentId === null);
    if (roots.length !== 1) context.addIssue({ code: "custom", message: "A mind map has exactly one centre." });
    const parent = new Map(map.nodes.map((node) => [node.id, node.parentId]));
    for (const node of map.nodes) {
      if (node.parentId !== null && !ids.has(node.parentId)) context.addIssue({ code: "custom", message: "A branch points at a missing node." });
      let cursor: string | null = node.parentId;
      for (let steps = 0; cursor !== null; steps += 1) {
        if (steps > map.nodes.length || cursor === node.id) {
          context.addIssue({ code: "custom", message: "Branches cannot loop." });
          break;
        }
        cursor = parent.get(cursor) ?? null;
      }
    }
    for (const link of map.links) if (!ids.has(link.from) || !ids.has(link.to) || link.from === link.to) context.addIssue({ code: "custom", message: "A connection points at a missing node." });
  });
assertSameType<z.output<typeof mindNodeSchema>, MindNode>();
assertSameType<z.output<typeof mindLinkSchema>, MindLink>();
assertSameType<z.output<typeof mindMapSchema>, MindMapData>();

export const conceptMapSchema = z
  .object({
    nodes: z.array(z.object({ id: z.string().min(1).max(40), label })).min(1).max(40),
    edges: z
      .array(z.object({ id: z.string().min(1).max(40), from: z.string().min(1).max(40), to: z.string().min(1).max(40), relation: z.enum(CONCEPT_RELATIONS), note: z.string().trim().max(300).nullable().optional() }))
      .max(80)
      .default([]),
  })
  .superRefine((map, context) => {
    const ids = new Set(map.nodes.map((node) => node.id));
    if (ids.size !== map.nodes.length) context.addIssue({ code: "custom", message: "Duplicate concept ids." });
    for (const edge of map.edges) if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) context.addIssue({ code: "custom", message: "A relationship points at a missing concept." });
  });
assertSameType<z.output<typeof conceptMapSchema>, ConceptMapData>();
