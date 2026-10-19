import { describe, expect, it } from "vitest";

import { labelChunk, selectContext, tokenize, type ContextChunk } from "@/lib/tutor/context";

const chunks: ContextChunk[] = [
  { id: "a", position: 0, heading: "Photosynthesis Overview", pageStart: 1, pageEnd: 1, content: "Photosynthesis is the process by which green plants convert light energy into chemical energy. The overall equation is 6CO2 + 6H2O -> C6H12O6 + 6O2." },
  { id: "b", position: 1, heading: "Light-Dependent Reactions", pageStart: 2, pageEnd: 2, content: "These reactions occur in the thylakoid membranes and produce ATP and NADPH. Chlorophyll is a pigment that absorbs light most strongly in the blue and red wavelengths." },
  { id: "c", position: 2, heading: "Calvin Cycle", pageStart: 3, pageEnd: 4, content: "The Calvin cycle is the set of reactions that fixes carbon dioxide into sugar using ATP and NADPH. It takes place in the stroma of the chloroplast." },
];

describe("tutor context", () => {
  it("tokenizes without stopwords", () => {
    expect(tokenize("What does the Calvin cycle do?")).toEqual(["calvin", "cycle"]);
  });

  it("ranks the chunk that answers the question first within a tight budget", () => {
    const picked = selectContext(chunks, "Where does the Calvin cycle take place?", null, 160);
    expect(picked.chunks.map((chunk) => chunk.id)).toEqual(["c"]);
    expect(picked.truncated).toBe(true);
  });

  it("always includes the chunk holding the highlighted text", () => {
    const picked = selectContext(chunks, "Explain this.", "Chlorophyll is a pigment", 180);
    expect(picked.chunks[0].id).toBe("b");
  });

  it("sends a short material whole in reading order", () => {
    const picked = selectContext(chunks, "summarize everything", null);
    expect(picked.chunks.map((chunk) => chunk.id)).toEqual(["a", "b", "c"]);
    expect(picked.truncated).toBe(false);
  });

  it("labels sections with headings and page ranges", () => {
    expect(labelChunk(chunks[2])).toBe("[Section 2: Calvin Cycle, pages 3-4]");
    expect(labelChunk({ ...chunks[0], heading: null, pageStart: null, pageEnd: null })).toBe("[Section 0]");
  });
});
