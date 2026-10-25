import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AiError } from "@/lib/ai/errors";
import { extractJson, generateJson } from "@/lib/ai/json";
import { MockProvider } from "@/lib/ai/providers/mock";
import type { AiProvider } from "@/lib/ai/types";

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips code fences and surrounding prose", () => {
    expect(extractJson('Sure! ```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
    expect(extractJson('Here you go: {"b":"x"} hope that helps')).toEqual({ b: "x" });
  });

  it("throws a friendly error when no JSON exists", () => {
    expect(() => extractJson("no json here")).toThrowError(/could not understand/i);
  });

  it("reads a reply whose answer holds a code block (the fence is not the wrapper)", () => {
    const java = { answer: "`name` is null here:\n\n```java\nString name = null;\nif (name != null) {\n  System.out.println(name.length());\n}\n```\n\nCheck it before you call a method.", follow_ups: ["example"] };
    expect(extractJson(JSON.stringify(java))).toEqual(java);
    const math = { answer: "```\n2x + 5 = 13\n2x = 8\nx = 4\n```" };
    expect(extractJson(JSON.stringify(math))).toEqual(math);
  });

  it("reads a fenced reply whose strings hold fences and brackets of their own", () => {
    const reply = { answer: "Like this:\n```sql\nSELECT * FROM t WHERE id IN (1, 2) -- {not json} [or this]\n```", sources: [] };
    expect(extractJson(`Sure! Here it is:\n\`\`\`json\n${JSON.stringify(reply, null, 2)}\n\`\`\`\nHope that helps.`)).toEqual(reply);
  });

  it("skips brackets in the sentence before the JSON", () => {
    expect(extractJson('Note [1]: {"a": 1}')).toEqual({ a: 1 });
    expect(extractJson('Use {curly} braces: {"a": 2}')).toEqual({ a: 2 });
    expect(extractJson("The list: [1, 2] and nothing else")).toEqual([1, 2]);
  });

  it("reads almost-JSON: raw line breaks, stray backslashes and trailing commas", () => {
    expect(extractJson('{"answer": "Line one\nLine two: \\(x\\) matches \\d+", "follow_ups": ["a", ],\n}')).toEqual({ answer: "Line one\nLine two: \\(x\\) matches \\d+", follow_ups: ["a"] });
    // A fix elsewhere leaves valid escapes alone.
    expect(extractJson('{"a": "tab\\t, quote \\" and \\u00e9", "b": "raw\tline",}')).toEqual({ a: 'tab\t, quote " and é', b: "raw\tline" });
  });

  it("says why it couldn't read the reply", () => {
    const detail = (text: string) => {
      try {
        extractJson(text);
      } catch (error) {
        return error instanceof AiError ? error.detail : String(error);
      }
      return "read";
    };
    expect(detail("no json here")).toBe("No JSON found in model output");
    expect(detail('{"answer": "Half an answ')).toBe("Unterminated JSON in model output");
    expect(detail('{"answer": "He said "hi" to me"}')).toMatch(/JSON/);
  });
});

describe("generateJson", () => {
  const schema = z.object({ value: z.number() });

  it("validates on the first attempt", async () => {
    const provider: AiProvider = {
      name: "test",
      model: "t",
      supportsVision: false,
      generate: async () => ({ text: '{"value": 3}', usage: { inputTokens: 1, outputTokens: 1 }, provider: "test", model: "t" }),
    };
    const result = await generateJson(provider, schema, { messages: [{ role: "user", content: "hi" }] });
    expect(result.data.value).toBe(3);
    expect(result.attempts).toBe(1);
  });

  it("asks the model to repair invalid output once", async () => {
    let calls = 0;
    const provider: AiProvider = {
      name: "test",
      model: "t",
      supportsVision: false,
      generate: async () => {
        calls += 1;
        return {
          text: calls === 1 ? '{"value": "oops"}' : '{"value": 7}',
          usage: { inputTokens: 2, outputTokens: 2 },
          provider: "test",
          model: "t",
        };
      },
    };
    const result = await generateJson(provider, schema, { messages: [{ role: "user", content: "hi" }] });
    expect(result.data.value).toBe(7);
    expect(result.attempts).toBe(2);
    expect(result.raw.usage.inputTokens).toBe(4);
  });

  it("tells the model why its reply couldn't be read, and keeps the reason for the log", async () => {
    const requests: string[] = [];
    const provider: AiProvider = {
      name: "test",
      model: "t",
      supportsVision: false,
      generate: async (options) => {
        requests.push(options.messages.at(-1)!.content as string);
        return { text: "Sorry, no JSON today.", usage: { inputTokens: 1, outputTokens: 1 }, provider: "test", model: "t" };
      },
    };
    await expect(generateJson(provider, schema, { messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ code: "invalid_output", detail: "No JSON found in model output" });
    expect(requests[1]).toContain("(No JSON found in model output)");
  });
});

describe("MockProvider", () => {
  it("produces a structured analysis from material text", async () => {
    const provider = new MockProvider();
    const material = [
      "Chapter 1 Arrays",
      "An array is a contiguous block of memory holding elements of the same type.",
      "Access time is O(1) because the address of element i equals base + i * size.",
      "Chapter 2 Linked Lists",
      "A linked list is a sequence of nodes where each node points to the next.",
    ].join("\n");
    const result = await provider.generate({
      task: "analyze_material",
      messages: [{ role: "user", content: `<material>${material}</material>` }],
    });
    const parsed = JSON.parse(result.text);
    expect(parsed.main_topics.map((t: { title: string }) => t.title)).toEqual(["Chapter 1 Arrays", "Chapter 2 Linked Lists"]);
    expect(parsed.definitions.length).toBeGreaterThanOrEqual(2);
    expect(parsed.recommended_methods.length).toBeGreaterThan(0);
  });
});

describe("generateJson deadlines", () => {
  const schema = z.object({ value: z.number() });

  it("gives the first call and its repair one shared deadline", async () => {
    const seen: Array<{ deadline?: number; timeoutMs?: number }> = [];
    let calls = 0;
    const provider: AiProvider = {
      name: "test",
      model: "t",
      supportsVision: false,
      generate: async (options) => {
        calls += 1;
        seen.push({ deadline: options.deadline, timeoutMs: options.timeoutMs });
        return { text: calls === 1 ? "not json" : '{"value": 1}', usage: { inputTokens: 1, outputTokens: 1 }, provider: "test", model: "t" };
      },
    };
    const before = Date.now();
    await generateJson(provider, schema, { messages: [{ role: "user", content: "hi" }] });
    expect(seen).toHaveLength(2);
    expect(seen[0].deadline).toBe(seen[1].deadline);
    expect(seen[0].deadline! - before).toBeLessThanOrEqual(110_000 + 50);
    expect(seen[1].timeoutMs).toBeLessThanOrEqual(seen[1].deadline! - before);
  });

  it("skips the repair when too little time is left", async () => {
    let calls = 0;
    const provider: AiProvider = {
      name: "test",
      model: "t",
      supportsVision: false,
      generate: async () => {
        calls += 1;
        return { text: "not json", usage: { inputTokens: 1, outputTokens: 1 }, provider: "test", model: "t" };
      },
    };
    await expect(generateJson(provider, schema, { messages: [{ role: "user", content: "hi" }], deadline: Date.now() + 2_000 })).rejects.toMatchObject({ code: "invalid_output" });
    expect(calls).toBe(1);
  });
});
