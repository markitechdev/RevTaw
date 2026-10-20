import { describe, expect, it } from "vitest";

import { mindMapHeuristically } from "@/lib/ai/providers/mock-study";
import { addChild, connectNodes, layoutMindMap, mindMapSchema, removeNode, subtreeIds, toggleNode, type MindMapData } from "@/lib/study/maps";
import { mindMapResponseSchema, toMindMap } from "@/lib/study/prompts/maps";

const base: MindMapData = {
  nodes: [
    { id: "n1", label: "Photosynthesis", parentId: null },
    { id: "n2", label: "Light reactions", parentId: "n1" },
    { id: "n3", label: "Calvin cycle", parentId: "n1" },
    { id: "n4", label: "ATP", parentId: "n2" },
  ],
  links: [],
};

describe("mind maps", () => {
  it("accepts one centre and rejects loops, orphans and second roots", () => {
    expect(mindMapSchema.safeParse(base).success).toBe(true);
    expect(mindMapSchema.safeParse({ ...base, nodes: [...base.nodes, { id: "n5", label: "Other", parentId: null }] }).success).toBe(false);
    expect(mindMapSchema.safeParse({ ...base, nodes: base.nodes.map((node) => (node.id === "n2" ? { ...node, parentId: "n4" } : node)) }).success).toBe(false);
    expect(mindMapSchema.safeParse({ ...base, links: [{ id: "l1", from: "n2", to: "n9" }] }).success).toBe(false);
  });

  it("adds, connects, folds and removes branches", () => {
    const { map, id } = addChild(base, "n3", "Stroma");
    expect(map.nodes.find((node) => node.id === id)?.parentId).toBe("n3");
    const linked = connectNodes(map, "n4", id, "used in");
    expect(linked.links).toHaveLength(1);
    expect(connectNodes(linked, id, "n4", null).links).toHaveLength(1);
    const removed = removeNode(linked, "n3");
    expect(removed.nodes.map((node) => node.id)).toEqual(["n1", "n2", "n4"]);
    expect(removed.links).toHaveLength(0);
    expect(removeNode(base, "n1")).toBe(base);
    expect(subtreeIds(base, "n2")).toEqual(["n2", "n4"]);
  });

  it("lays out the tree left to right and hides folded branches", () => {
    const layout = layoutMindMap(base);
    const x = Object.fromEntries(layout.nodes.map((entry) => [entry.node.id, entry.x]));
    expect(x.n1).toBeLessThan(x.n2);
    expect(x.n2).toBeLessThan(x.n4);
    const folded = layoutMindMap(toggleNode(base, "n2"));
    expect(folded.nodes.find((entry) => entry.node.id === "n4")).toBeUndefined();
    expect(folded.nodes.find((entry) => entry.node.id === "n2")?.hiddenChildren).toBe(1);
  });

  it("turns the model's nested branches into stored nodes", () => {
    const map = toMindMap(mindMapResponseSchema.parse({ root: "Cells", branches: [{ label: "Nucleus", children: [{ label: "DNA" }] }, { label: "Membrane" }], links: [{ from: "DNA", to: "Membrane", label: "protected by" }] }));
    expect(mindMapSchema.safeParse(map).success).toBe(true);
    expect(map.nodes).toHaveLength(4);
    expect(map.links[0]).toMatchObject({ from: "n3", to: "n4" });
  });
});

it("mock mind maps validate", () => {
  const transcript = `[Section: Photosynthesis Overview]\nPhotosynthesis is the process by which green plants convert light energy into chemical energy.\nChlorophyll is a pigment that absorbs light.\n\n[Section: Calvin Cycle]\nThe Calvin cycle is the set of reactions that fixes carbon dioxide into sugar.\nATP is the energy carrier of the cell.`;
  expect(mindMapSchema.safeParse(toMindMap(mindMapResponseSchema.parse(mindMapHeuristically(transcript, "Material title: Photosynthesis")))).success).toBe(true);
});
