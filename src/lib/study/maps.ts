/**
 * Mind maps and concept maps (spec §16). Shared, client-safe and free of zod:
 * the data shapes stored in `study_maps.data` and the pure helpers the editors
 * use. Their validation (the server re-validates every save) is in
 * `map-schemas.ts`.
 */

// ---------------------------------------------------------------------------
// Mind maps: one root, nested branches, optional cross-links
// ---------------------------------------------------------------------------

export type MindNode = { id: string; label: string; note?: string | null; parentId: string | null; collapsed?: boolean };
export type MindLink = { id: string; from: string; to: string; label?: string | null };
export type MindMapData = { nodes: MindNode[]; links: MindLink[] };

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

// ---------------------------------------------------------------------------
// Concept maps: concepts and explicit, typed relationships
// ---------------------------------------------------------------------------

export const CONCEPT_RELATIONS = ["causes", "requires", "leads_to", "contains", "depends_on", "is_example_of"] as const;
export type ConceptRelation = (typeof CONCEPT_RELATIONS)[number];

export const RELATION_LABEL: Record<ConceptRelation, string> = {
  causes: "causes",
  requires: "requires",
  leads_to: "leads to",
  contains: "contains",
  depends_on: "depends on",
  is_example_of: "is an example of",
};

export type ConceptMapData = {
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ id: string; from: string; to: string; relation: ConceptRelation; note?: string | null }>;
};
export type ConceptEdge = ConceptMapData["edges"][number];

export function addConcept(map: ConceptMapData, text: string): ConceptMapData {
  if (map.nodes.some((node) => node.label.toLowerCase() === text.trim().toLowerCase())) return map;
  return { ...map, nodes: [...map.nodes, { id: nextNodeId(map, "c"), label: text.trim() }] };
}

export function removeConcept(map: ConceptMapData, id: string): ConceptMapData {
  return { nodes: map.nodes.filter((node) => node.id !== id), edges: map.edges.filter((edge) => edge.from !== id && edge.to !== id) };
}

export function renameConcept(map: ConceptMapData, id: string, text: string): ConceptMapData {
  return { ...map, nodes: map.nodes.map((node) => (node.id === id ? { ...node, label: text } : node)) };
}

export function addRelationship(map: ConceptMapData, from: string, to: string, relation: ConceptRelation): ConceptMapData {
  if (from === to || map.edges.some((edge) => edge.from === from && edge.to === to)) return map;
  return { ...map, edges: [...map.edges, { id: nextNodeId({ nodes: map.edges }, "e"), from, to, relation, note: null }] };
}

export function removeRelationship(map: ConceptMapData, id: string): ConceptMapData {
  return { ...map, edges: map.edges.filter((edge) => edge.id !== id) };
}

export function labelOf(map: { nodes: Array<{ id: string; label: string }> }, id: string): string {
  return map.nodes.find((node) => node.id === id)?.label ?? "?";
}
