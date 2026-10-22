import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { describeAiSetup, getAiProvider, providerOrder } from "@/lib/ai";
import { estimateInputTokens } from "@/lib/ai/budget";
import { AiRouter } from "@/lib/ai/router";
import type { AiProvider } from "@/lib/ai/types";
import { getServerEnv } from "@/lib/env";

const KEYS = [
  "AI_PROVIDER",
  "AI_PROVIDER_ORDER",
  "GROQ_API_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "OLLAMA_BASE_URL",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "AI_MODEL_FAST",
  "AI_MODEL_STRONG",
];

beforeEach(() => {
  for (const key of KEYS) vi.stubEnv(key, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function names(provider: AiProvider): string[] {
  return provider instanceof AiRouter ? provider.candidates.map((candidate) => `${candidate.name}:${candidate.model}`) : [`${provider.name}:${provider.model}`];
}

describe("getAiProvider", () => {
  it("routes Groq first and Cloudflare second, with tier models", () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "cf_test");
    expect(names(getAiProvider("strong"))).toEqual(["groq:openai/gpt-oss-120b", "cloudflare:@cf/openai/gpt-oss-120b"]);
    expect(names(getAiProvider("fast"))).toEqual(["groq:openai/gpt-oss-20b", "cloudflare:@cf/openai/gpt-oss-20b"]);
    expect(getAiProvider("fast").supportsVision).toBe(true);
  });

  it("never picks Google automatically", () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "g_test");
    vi.stubEnv("OPENAI_API_KEY", "sk_test");
    expect(names(getAiProvider("strong"))).toEqual(["openai:gpt-4.1"]);
    expect(describeAiSetup().providers).toEqual(["openai"]);
  });

  it("pins every request to AI_PROVIDER with its model overrides", () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("AI_MODEL_STRONG", "claude-opus-4-1");
    expect(names(getAiProvider("strong"))).toEqual(["anthropic:claude-opus-4-1"]);
  });

  it("uses the mock outside production when nothing is configured", () => {
    expect(names(getAiProvider("strong"))).toEqual(["mock:mock-heuristics-1"]);
    expect(describeAiSetup().mode).toBe("mock");
  });

  it("follows AI_PROVIDER_ORDER and ignores unknown names", () => {
    vi.stubEnv("AI_PROVIDER_ORDER", "cloudflare, groq, nope, mock");
    expect(providerOrder(getServerEnv())).toEqual(["cloudflare", "groq"]);
  });

  it("rejects a malformed Cloudflare account ID with a clear message", () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "../../evil");
    expect(() => getServerEnv()).toThrow(/32-character account ID/);
  });
});

describe("estimateInputTokens", () => {
  it("counts text conservatively and images at a fixed rate", () => {
    expect(estimateInputTokens({ system: "x".repeat(320), messages: [{ role: "user", content: "y".repeat(320) }] })).toBe(200 + 8);
    expect(
      estimateInputTokens({ messages: [{ role: "user", content: [{ type: "image", mimeType: "image/png", data: "AA" }, { type: "text", text: "abc" }] }] }),
    ).toBe(1 + 8 + 1600);
  });
});
