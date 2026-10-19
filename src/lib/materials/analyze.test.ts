import { describe, expect, it } from "vitest";

import { analysisResponseSchema, parseAnalysisData } from "@/lib/materials/analysis-schema";
import { buildTranscript } from "@/lib/materials/analyze";
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
    const { transcript, coverageRatio } = buildTranscript(chunks, 2500);
    expect(transcript).toContain("[Not included: 2 more section(s) titled: Part 4; Part 5]");
    expect(coverageRatio).toBeCloseTo(0.5, 1);
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
