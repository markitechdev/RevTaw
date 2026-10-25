import { afterEach, describe, expect, it, vi } from "vitest";

import { type AiError, isAiError } from "@/lib/ai/errors";
import { OpenAiCompatibleProvider, responsesText } from "@/lib/ai/providers/openai-compatible";
import { cooldownFor } from "@/lib/ai/router";

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

function mockFetch(responses: Array<{ status?: number; body: unknown; headers?: Record<string, string> }>) {
  const calls: Call[] = [];
  const queue = [...responses];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
      const next = queue.shift();
      if (!next) throw new Error("unexpected fetch");
      return new Response(typeof next.body === "string" ? next.body : JSON.stringify(next.body), {
        status: next.status ?? 200,
        headers: { "content-type": "application/json", ...(next.headers ?? {}) },
      });
    }),
  );
  return calls;
}

const chatOk = (content: string) => ({
  body: { choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 5 }, model: "served-model" },
});

const groq = () =>
  new OpenAiCompatibleProvider({
    name: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: "test-key",
    model: "openai/gpt-oss-120b",
    maxTokensField: "max_completion_tokens",
    reasoningEffort: "low",
    strictJsonSchema: true,
    extraBody: { include_reasoning: false },
    maxRequestTokens: 7_500,
  });

const cloudflare = () =>
  new OpenAiCompatibleProvider({
    name: "cloudflare",
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/abc/ai/v1/",
    apiKey: "cf-token",
    model: "@cf/openai/gpt-oss-120b",
    visionModel: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    maxTokensField: "max_tokens",
    useResponsesApi: true,
    reasoningEffort: "low",
    jsonObject: false,
    maxRequestTokens: 110_000,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAiCompatibleProvider (Groq)", () => {
  it("sends an OpenAI chat request with the reasoning allowance and JSON mode", async () => {
    const calls = mockFetch([chatOk('{"ok":true}')]);
    const result = await groq().generate({ system: "Be brief.", messages: [{ role: "user", content: "Hi" }], maxTokens: 1000, json: true, temperature: 0.3 });

    expect(calls[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(calls[0].headers.authorization).toBe("Bearer test-key");
    expect(calls[0].body).toMatchObject({
      model: "openai/gpt-oss-120b",
      max_completion_tokens: 1000 + 768,
      reasoning_effort: "low",
      include_reasoning: false,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Hi" },
      ],
    });
    expect(result).toMatchObject({ text: '{"ok":true}', provider: "groq", model: "served-model", usage: { inputTokens: 12, outputTokens: 5 } });
  });

  it("thinks longer when a request asks for it, with room for the longer reasoning", async () => {
    const calls = mockFetch([chatOk('{"ok":true}')]);
    const options = { messages: [{ role: "user" as const, content: "Solve 2x + 3 = 11" }], maxTokens: 1000, reasoning: "medium" as const };
    await groq().generate(options);
    expect(calls[0].body).toMatchObject({ reasoning_effort: "medium", max_completion_tokens: 1000 + 2048 });
    expect(groq().requestTokens(options)).toBeGreaterThan(groq().requestTokens({ ...options, reasoning: undefined }) + 1_200);
    // A model without a reasoning setting ignores the request.
    const plain = new OpenAiCompatibleProvider({ name: "ollama", baseUrl: "http://localhost:11434/v1", model: "qwen3.5:9b", maxTokensField: "max_tokens" });
    const plainCalls = mockFetch([chatOk("ok")]);
    await plain.generate(options);
    expect(plainCalls[0].body).not.toHaveProperty("reasoning_effort");
    expect(plainCalls[0].body.max_tokens).toBe(1000);
  });

  it("uses strict json_schema when a schema is given", async () => {
    const calls = mockFetch([chatOk('{"a":1}')]);
    const schema = { type: "object", properties: { a: { type: "number" } }, required: ["a"], additionalProperties: false };
    await groq().generate({ messages: [{ role: "user", content: "x" }], jsonSchema: { name: "thing", schema } });
    expect(calls[0].body.response_format).toEqual({ type: "json_schema", json_schema: { name: "thing", strict: true, schema } });
  });

  it("says a request over the per-minute budget does not fit", () => {
    const provider = groq();
    expect(provider.fits({ messages: [{ role: "user", content: "short question" }], maxTokens: 1500 })).toBe(true);
    // ~40K characters of material plus an 8K output cap is far over 7.5K tokens.
    expect(provider.fits({ messages: [{ role: "user", content: "x".repeat(40_000) }], maxTokens: 8000 })).toBe(false);
    expect(provider.fits({ messages: [{ role: "user", content: "x" }], maxTokens: 8000 })).toBe(false);
  });

  it("refuses images without a vision model", async () => {
    const provider = groq();
    const options = { messages: [{ role: "user" as const, content: [{ type: "image" as const, mimeType: "image/png", data: "AAAA" }] }] };
    expect(provider.supportsVision).toBe(false);
    expect(provider.fits(options)).toBe(false);
    await expect(provider.generate(options)).rejects.toMatchObject({ code: "unsupported" });
  });

  it("maps 429 to rate_limited with Retry-After", async () => {
    mockFetch([{ status: 429, body: { error: { message: "Rate limit reached" } }, headers: { "retry-after": "7" } }]);
    const error = await groq()
      .generate({ messages: [{ role: "user", content: "x" }] })
      .catch((caught: unknown) => caught);
    expect(isAiError(error) && error.code).toBe("rate_limited");
    expect(isAiError(error) && error.retryAfterSeconds).toBe(7);
  });

  it("maps 402 (out of credit) to rate_limited with the longest cool-down", async () => {
    mockFetch([{ status: 402, body: { error: "this model requires a subscription or usage credits" } }]);
    const error = await groq()
      .generate({ messages: [{ role: "user", content: "x" }] })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "rate_limited", retryAfterSeconds: 3_600 });
    expect(cooldownFor(error as AiError)).toBe(3_600_000);
  });

  it("maps 413 (request too large) to content_too_large", async () => {
    mockFetch([{ status: 413, body: { error: { message: "Request too large" } } }]);
    await expect(groq().generate({ messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({ code: "content_too_large" });
  });

  it("treats an empty answer as invalid output", async () => {
    mockFetch([{ body: { choices: [{ message: { content: "" }, finish_reason: "length" }] } }]);
    await expect(groq().generate({ messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({ code: "invalid_output" });
  });
});

describe("OpenAiCompatibleProvider (Cloudflare)", () => {
  it("sends gpt-oss text requests to the Responses API and reads the message output", async () => {
    const calls = mockFetch([
      {
        body: {
          status: "completed",
          output: [
            { type: "reasoning", content: [{ type: "reasoning_text", text: "thinking..." }] },
            { type: "message", role: "assistant", content: [{ type: "output_text", text: '{"answer":"Bitaw"}' }] },
          ],
          usage: { input_tokens: 40, output_tokens: 9 },
        },
      },
    ]);
    const result = await cloudflare().generate({
      system: "Return JSON.",
      messages: [
        { role: "user", content: "Q1" },
        { role: "assistant", content: "A1" },
        { role: "user", content: "Q2" },
      ],
      maxTokens: 500,
      json: true,
    });

    expect(calls[0].url).toBe("https://api.cloudflare.com/client/v4/accounts/abc/ai/v1/responses");
    expect(calls[0].body).toMatchObject({
      model: "@cf/openai/gpt-oss-120b",
      instructions: "Return JSON.",
      max_output_tokens: 500 + 768,
      reasoning: { effort: "low" },
      stream: false,
      input: [
        { role: "user", content: "Q1" },
        { role: "assistant", content: "A1" },
        { role: "user", content: "Q2" },
      ],
    });
    expect(calls[0].body).not.toHaveProperty("response_format");
    expect(result).toMatchObject({ text: '{"answer":"Bitaw"}', provider: "cloudflare", stopReason: "stop", usage: { inputTokens: 40, outputTokens: 9 } });
  });

  it("falls back to chat completions when /responses rejects the request format", async () => {
    const calls = mockFetch([{ status: 400, body: { errors: [{ message: "bad input" }] } }, chatOk("hello")]);
    const result = await cloudflare().generate({ messages: [{ role: "user", content: "x" }], json: true });
    expect(calls.map((call) => call.url.split("/ai/v1")[1])).toEqual(["/responses", "/chat/completions"]);
    expect(calls[1].body).not.toHaveProperty("response_format");
    expect(calls[1].body.max_tokens).toBe(4096 + 768);
    expect(result.text).toBe("hello");
  });

  it("does not retry on chat completions after a rate limit", async () => {
    const calls = mockFetch([{ status: 429, body: { errors: [] } }]);
    await expect(cloudflare().generate({ messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({ code: "rate_limited" });
    expect(calls).toHaveLength(1);
  });

  it("reports a truncated Responses answer as stopped by length", async () => {
    mockFetch([
      {
        body: {
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [{ type: "message", content: [{ type: "output_text", text: '{"partial":' }] }],
        },
      },
    ]);
    const result = await cloudflare().generate({ messages: [{ role: "user", content: "x" }] });
    expect(result.stopReason).toBe("length");
  });

  it("sends images to the vision model as data URLs on chat completions", async () => {
    const calls = mockFetch([chatOk("Red")]);
    await cloudflare().generate({
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mimeType: "image/png", data: "QUJD" },
            { type: "text", text: "Color?" },
          ],
        },
      ],
      maxTokens: 16,
    });
    expect(calls[0].url.endsWith("/chat/completions")).toBe(true);
    expect(calls[0].body).toMatchObject({
      model: "@cf/mistralai/mistral-small-3.1-24b-instruct",
      max_tokens: 16,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
            { type: "text", text: "Color?" },
          ],
        },
      ],
    });
    expect(calls[0].body).not.toHaveProperty("reasoning_effort");
  });
});

describe("responsesText", () => {
  it("joins message parts and falls back to output_text", () => {
    expect(responsesText({ output: [{ type: "message", content: [{ type: "output_text", text: "a" }, { type: "output_text", text: "b" }] }] })).toBe("ab");
    expect(responsesText({ output: [], output_text: "c" })).toBe("c");
    expect(responsesText({ output: [{ type: "reasoning", content: [{ type: "reasoning_text", text: "hidden" }] }] })).toBe("");
  });
});
