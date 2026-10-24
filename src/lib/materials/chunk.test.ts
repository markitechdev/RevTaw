import { describe, expect, it } from "vitest";

import { chunkSections, CHUNK_MAX_CHARS, isHeadingLine, splitIntoParagraphs } from "@/lib/materials/chunk";

describe("isHeadingLine", () => {
  it("recognizes chapter, numbered, upper-case and markdown headings", () => {
    expect(isHeadingLine("Chapter 1 Arrays")).toBe(true);
    expect(isHeadingLine("2.3 Binary Search")).toBe(true);
    expect(isHeadingLine("LIGHT-DEPENDENT REACTIONS")).toBe(true);
    expect(isHeadingLine("## Calvin Cycle")).toBe(true);
    expect(isHeadingLine("Light-Dependent Reactions")).toBe(true);
    expect(isHeadingLine("The Structure of the Cell")).toBe(true);
  });

  it("rejects sentences and long lines", () => {
    expect(isHeadingLine("An array is a contiguous block of memory.")).toBe(false);
    expect(isHeadingLine("It takes place in the stroma")).toBe(false);
    expect(isHeadingLine("a".repeat(100))).toBe(false);
  });
});

describe("splitIntoParagraphs", () => {
  it("separates headings even when the text only has single line breaks", () => {
    const paragraphs = splitIntoParagraphs("Chapter 1 Arrays\nAn array is contiguous.\nIt is fast.\nChapter 2 Searching\nLinear search is O(n).");
    expect(paragraphs).toEqual([
      "Chapter 1 Arrays",
      "An array is contiguous.\nIt is fast.",
      "Chapter 2 Searching",
      "Linear search is O(n).",
    ]);
  });
});

describe("chunkSections", () => {
  it("keeps page ranges and nearest headings", () => {
    const chunks = chunkSections([
      { page: 1, text: "Chapter 1 Arrays\nArrays are contiguous." },
      { page: 2, text: "Chapter 2 Searching\nBinary search halves the array." },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBe("Chapter 1 Arrays");
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[0].pageEnd).toBe(2);
  });

  it("splits long content into bounded chunks with sequential positions", () => {
    const paragraph = "Sentence number one is here. ".repeat(400);
    const chunks = chunkSections([{ page: null, text: paragraph }]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= CHUNK_MAX_CHARS)).toBe(true);
    expect(chunks.map((chunk) => chunk.position)).toEqual(chunks.map((_, index) => index));
  });

  it("starts a new chunk at a heading once the current one has substance", () => {
    const filler = "Detail sentence. ".repeat(150);
    const chunks = chunkSections([{ page: null, text: `Chapter 1 Arrays\n${filler}\n\nChapter 2 Lists\n${filler}` }]);
    expect(chunks.map((chunk) => chunk.heading)).toEqual(["Chapter 1 Arrays", "Chapter 2 Lists"]);
  });
});
