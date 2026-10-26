import { describe, expect, it } from "vitest";

import { analysisResponseSchema, parseAnalysisData } from "@/lib/materials/analysis-schema";
import { buildTranscript, coverageDetail, coverageNote } from "@/lib/materials/analyze";
import { analyzeHeuristically } from "@/lib/ai/providers/mock";

describe("buildTranscript", () => {
  it("labels sections with headings and pages and reports full coverage", () => {
    const { transcript, coverageRatio } = buildTranscript([
      { position: 0, heading: "Arrays", pageStart: 1, pageEnd: 2, content: "Arrays are contiguous." },
      { position: 1, heading: null, pageStart: 3, pageEnd: 3, content: "Lists are linked." },
    ]);
    expect(transcript).toContain("[Section: Arrays, pages 1-2]");
    expect(transcript).toContain("[Section 2, page 3]");
    expect(coverageRatio).toBe(1);
  });

  it("truncates to the budget and lists omitted headings", () => {
    const chunks = Array.from({ length: 5 }, (_, index) => ({
      position: index,
      heading: `Part ${index + 1}`,
      pageStart: null,
      pageEnd: null,
      content: "x".repeat(1000),
    }));
    const { transcript, coverageRatio, focused } = buildTranscript(chunks, 2500);
    expect(transcript).toContain("[Not included: 2 more section(s) titled: Part 4; Part 5]");
    expect(coverageRatio).toBeCloseTo(0.5, 1);
    expect(focused).toBe(false);
  });

  const book = ["Cells", "Tissues", "Organs", "Photosynthesis", "Respiration", "Genetics"].map((heading, index) => ({
    position: index,
    heading,
    pageStart: index + 1,
    pageEnd: index + 1,
    content: `${heading} chapter. ${heading === "Photosynthesis" ? "Plants turn light into sugar in the chloroplast. " : ""}${"Filler text about the chapter. ".repeat(30)}`.slice(0, 1000),
  }));

  it("puts the sections on a focus topic in first when a material is too long", () => {
    const { transcript, coverageRatio, focused } = buildTranscript(book, 2500, { text: "photosynthesis and chloroplasts" });
    expect(focused).toBe(true);
    expect(transcript).toContain("[Section: Photosynthesis, page 4]");
    expect(transcript).toContain("Plants turn light into sugar");
    // The rest fills up in reading order, and the skipped stretch is marked.
    expect(transcript.indexOf("[Section: Cells, page 1]")).toBeLessThan(transcript.indexOf("[Section: Photosynthesis, page 4]"));
    expect(transcript).toContain("[Skipped here: 1 section(s)]");
    expect(transcript).toContain("[Not included: 3 more section(s) titled: Organs; Respiration; Genetics]");
    expect(coverageRatio).toBeCloseTo(2500 / book.reduce((sum, chunk) => sum + chunk.content.length, 0), 5);
  });

  it("gives a weak-concept focus only its share of the budget", () => {
    const { transcript } = buildTranscript(book, 3000, { text: "chapter", share: 0.4 });
    // Every section matches "chapter"; only 1200 characters' worth go first, the rest follow the reading order.
    expect(transcript.match(/\[Section: /g)).toHaveLength(3);
    expect(transcript).toContain("[Section: Cells, page 1]");
  });

  it("reads in order when the focus matches nothing or the material fits", () => {
    expect(buildTranscript(book, 2500, { text: "thermodynamics" })).toEqual(buildTranscript(book, 2500));
    const whole = buildTranscript(book, 10_000, { text: "photosynthesis" });
    expect(whole.focused).toBe(false);
    expect(whole.coverageRatio).toBe(1);
    expect(whole.transcript).not.toContain("Not included");
  });
});

describe("coverage notes", () => {
  it("say how much of a long material was used, and how it was picked", () => {
    expect(coverageNote(1, false)).toBe("");
    expect(coverageNote(0.42, false)).toContain("only the first 42%");
    expect(coverageNote(0.42, true)).toContain("the sections that match the focus");
    expect(coverageDetail(1, true, "the sections on your topic")).toBeNull();
    expect(coverageDetail(0.42, false, "the sections on your topic")).toBe("Built from the first 42% of a very long material.");
    expect(coverageDetail(0.42, true, "the sections on your topic")).toBe("Built from 42% of a very long material, the sections on your topic first.");
  });
});

describe("analysis schema", () => {
  it("accepts the mock provider's output", () => {
    const output = analyzeHeuristically("Chapter 1 Arrays\nAn array is a contiguous block.\nAccess time is O(1).");
    const parsed = analysisResponseSchema.safeParse(output);
    expect(parsed.success).toBe(true);
  });

  it("degrades unknown stored payloads to empty lists", () => {
    const data = parseAnalysisData({ main_topics: "not-a-list" });
    expect(data.main_topics).toEqual([]);
    expect(parseAnalysisData(null).definitions).toEqual([]);
  });

  it("drops recommendations for unknown methods", () => {
    const parsed = analysisResponseSchema.safeParse({
      summary: "s",
      difficulty: "hard",
      estimated_study_minutes: "30",
      recommended_methods: [{ method: "osmosis", reason: "nope" }],
    });
    expect(parsed.success).toBe(false);
  });
});
