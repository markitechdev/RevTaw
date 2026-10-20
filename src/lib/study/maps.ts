import { z } from "zod";

/**
 * Mind maps (spec §16). Shared, client-safe: the data shape
 * stored in `study_maps.data`, their validation (the server re-validates every
 * save) and the pure helpers the editors use.
 */

// ---------------------------------------------------------------------------
// Mind maps: one root, nested branches, optional cross-links
// ---------------------------------------------------------------------------

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

export type MindNode = z.infer<typeof mindNodeSchema>;
export type MindLink = z.infer<typeof mindLinkSchema>;
export type MindMapData = z.infer<typeof mindMapSchema>;

export function rootOf(map: MindMapData): MindNode {
  return map.nodes.find((node) => node.parentId === null) ?? map.nodes[0];
}

export function childrenOf(map: MindMapData, id: string): MindNode[] {
  return map.nodes.filter((node) => node.parentId === id);
}

/** A node and everything below it. */
export function subtreeIds(map: MindMapData, id: string): string[] {
  const result = [id];
  for (let index = 0; index < result.length; index += 1) result.push(...childrenOf(map, result[index]).map((node) => node.id));
  return result;
}

export function nextNodeId(map: { nodes: Array<{ id: string }> }, prefix = "n"): string {
  const used = new Set(map.nodes.map((node) => node.id));
  for (let index = map.nodes.length + 1; ; index += 1) if (!used.has(`${prefix}${index}`)) return `${prefix}${index}`;
}

export function addChild(map: MindMapData, parentId: string, text: string): { map: MindMapData; id: string } {
  const id = nextNodeId(map);
  return { id, map: { ...map, nodes: [...map.nodes.map((node) => (node.id === parentId ? { ...node, collapsed: false } : node)), { id, label: text, note: null, parentId }] } };
}

export function removeNode(map: MindMapData, id: string): MindMapData {
  if (map.nodes.find((node) => node.id === id)?.parentId === null) return map;
  const gone = new Set(subtreeIds(map, id));
  return { nodes: map.nodes.filter((node) => !gone.has(node.id)), links: map.links.filter((link) => !gone.has(link.from) && !gone.has(link.to)) };
}

export function renameNode(map: MindMapData, id: string, text: string): MindMapData {
  return { ...map, nodes: map.nodes.map((node) => (node.id === id ? { ...node, label: text } : node)) };
}

export function toggleNode(map: MindMapData, id: string): MindMapData {
  return { ...map, nodes: map.nodes.map((node) => (node.id === id ? { ...node, collapsed: !node.collapsed } : node)) };
}

export function connectNodes(map: MindMapData, from: string, to: string, text: string | null): MindMapData {
  if (from === to || map.links.some((link) => (link.from === from && link.to === to) || (link.from === to && link.to === from))) return map;
  return { ...map, links: [...map.links, { id: nextNodeId({ nodes: map.links }, "l"), from, to, label: text }] };
}

export type MindLayoutNode = { node: MindNode; x: number; y: number; depth: number; hiddenChildren: number };

/** Left-to-right tree layout: depth gives x, leaf order gives y; collapsed branches hide their children. */
export function layoutMindMap(map: MindMapData, columnWidth = 210, rowHeight = 52): { nodes: MindLayoutNode[]; width: number; height: number } {
  const placed: MindLayoutNode[] = [];
  let row = 0;
  const visit = (node: MindNode, depth: number): number => {
    const children = childrenOf(map, node.id);
    if (node.collapsed || children.length === 0) {
      const y = row * rowHeight + rowHeight / 2;
      row += 1;
      placed.push({ node, x: depth * columnWidth + 10, y, depth, hiddenChildren: node.collapsed ? subtreeIds(map, node.id).length - 1 : 0 });
      return y;
    }
    const ys = children.map((child) => visit(child, depth + 1));
    const y = (Math.min(...ys) + Math.max(...ys)) / 2;
    placed.push({ node, x: depth * columnWidth + 10, y, depth, hiddenChildren: 0 });
    return y;
  };
  visit(rootOf(map), 0);
  const depth = Math.max(...placed.map((entry) => entry.depth));
  return { nodes: placed, width: (depth + 1) * columnWidth + 20, height: Math.max(rowHeight, row * rowHeight) };
}
