import { beforeEach, describe, expect, it, vi } from "vitest";

const json = vi.hoisted(() => ({ generateJson: vi.fn() }));
vi.mock("@/lib/ai/json", () => json);
vi.mock("@/lib/ai", async () => ({ ...(await vi.importActual<typeof import("@/lib/ai/errors")>("@/lib/ai/errors")), getAiProvider: () => ({ name: "test" }) }));
vi.mock("@/lib/concepts/service", () => ({ knownConceptsLine: () => "" }));

const { compareRecallAnswer, recallComparisonSchema } = await import("@/lib/study/ai");

const input = {
  materialTitle: "Photosynthesis",
  prompt: "Give an example of a producer.",
  modelAnswer: "Green plants such as grass make their own food.",
  keyPoints: ["makes its own food", "uses light energy"],
  studentAnswer: "Seaweed, because it makes its own food from sunlight.",
};

describe("compareRecallAnswer", () => {
  beforeEach(() => {
    json.generateJson.mockReset();
    json.generateJson.mockResolvedValue({ data: { score: 100, correct_points: [], missing_points: [], incorrect_points: [], feedback: "Good." }, raw: { provider: "test", model: "test" } });
  });

  it("asks why each wrong point is wrong, and for the reasoning behind the right answer", async () => {
    await compareRecallAnswer(input);
    const system: string = json.generateJson.mock.calls[0][2].system;
    expect(system).toContain("<why it is wrong: what the material says instead>");
    expect(system).toContain("the correct idea and the reasoning behind it");
  });

  it("judges a student's own example by the material's definition only for an example prompt", async () => {
    await compareRecallAnswer({ ...input, format: "example" });
    await compareRecallAnswer({ ...input, format: "definition" });
    const [example, definition] = json.generateJson.mock.calls.map((call) => call[2].system as string);
    expect(example).toContain("an example that fits the material's definition and key points counts as correct");
    expect(definition).not.toContain("asks for an example");
  });
});

describe("recallComparisonSchema", () => {
  it("shortens a long reasoned wrong point instead of failing the whole check", () => {
    const parsed = recallComparisonSchema.parse({ score: 20, correct_points: [], missing_points: [], incorrect_points: [`Plants eat soil — ${"the material says otherwise ".repeat(30)}`], feedback: "Not yet." });
    expect(parsed.incorrect_points[0].length).toBeLessThanOrEqual(400);
    expect(parsed.incorrect_points[0].endsWith("…")).toBe(true);
  });
});
