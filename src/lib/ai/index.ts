import "server-only";

import { AiError } from "@/lib/ai/errors";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { GoogleProvider } from "@/lib/ai/providers/google";
import { MockProvider } from "@/lib/ai/providers/mock";
import { OpenAiProvider } from "@/lib/ai/providers/openai";
import { OpenAiCompatibleProvider } from "@/lib/ai/providers/openai-compatible";
import { MeteredProvider } from "@/lib/ai/quota";
import { AiRouter } from "@/lib/ai/router";
import type { AiProvider, AiTier } from "@/lib/ai/types";
import { getServerEnv, type ServerEnv } from "@/lib/env";

export type { AiProvider, AiTier } from "@/lib/ai/types";
export { AiError, isAiError } from "@/lib/ai/errors";

export type AiProviderName = "groq" | "cloudflare" | "ollama" | "anthropic" | "openai" | "google" | "mock";

const PROVIDER_NAMES: readonly AiProviderName[] = ["groq", "cloudflare", "ollama", "anthropic", "openai", "google", "mock"];

/**
 * Automatic order: the free tiers first (Groq, then Cloudflare Workers AI,
 * which has no per-minute token cap and takes the long requests), the paid
 * tiers next, a local Ollama last. Google is never chosen automatically:
 * Gemini's terms bar apps likely used by students under 18. Change the order
 * with AI_PROVIDER_ORDER.
 */
export const DEFAULT_PROVIDER_ORDER: readonly AiProviderName[] = ["groq", "cloudflare", "anthropic", "openai", "ollama"];

/**
 * Default models per provider and tier. "fast" is for short, simple tasks
 * (grading, checks, OCR); "strong" for educational reasoning (analysis,
 * generation, Tamari's replies).
 */
export const DEFAULT_MODELS: Record<Exclude<AiProviderName, "mock">, Record<AiTier, string>> = {
  groq: { fast: "openai/gpt-oss-20b", strong: "openai/gpt-oss-120b" },
  cloudflare: { fast: "@cf/openai/gpt-oss-20b", strong: "@cf/openai/gpt-oss-120b" },
  ollama: { fast: "qwen3.5:4b", strong: "qwen3.5:9b" },
  anthropic: { fast: "claude-haiku-4-5", strong: "claude-sonnet-4-5" },
  openai: { fast: "gpt-4.1-mini", strong: "gpt-4.1" },
  google: { fast: "gemini-2.5-flash", strong: "gemini-2.5-pro" },
};

/** Apache-2.0 vision model on Workers AI, used to read photos when text extraction finds nothing. */
export const DEFAULT_CLOUDFLARE_VISION_MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
/** Groq's free plan allows 8K tokens a minute per model, and counts the output cap; leave room. */
const GROQ_DEFAULT_MAX_REQUEST_TOKENS = 7_500;
/** gpt-oss on Workers AI has a 128K context; keep a margin for the tokenizer estimate. */
const CLOUDFLARE_MAX_REQUEST_TOKENS = 110_000;
/** Ollama's context is set in a Modelfile (num_ctx), not per request. */
const OLLAMA_DEFAULT_CONTEXT_TOKENS = 8_192;

function isGptOss(model: string): boolean {
  return /gpt-oss/i.test(model);
}

function cloudflareBaseUrl(env: ServerEnv): string {
  if (env.CLOUDFLARE_AI_BASE_URL) return env.CLOUDFLARE_AI_BASE_URL;
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID ?? "")}/ai/v1`;
}

/** Builds one provider for a tier, or null when its credentials are missing. */
export function buildProvider(name: AiProviderName, tier: AiTier, env: ServerEnv = getServerEnv(), modelOverride?: string): AiProvider | null {
  switch (name) {
    case "groq": {
      if (!env.GROQ_API_KEY) return null;
      const model = modelOverride ?? (tier === "fast" ? env.GROQ_MODEL_FAST : env.GROQ_MODEL_STRONG) ?? DEFAULT_MODELS.groq[tier];
      const gptOss = isGptOss(model);
      return new OpenAiCompatibleProvider({
        name: "groq",
        baseUrl: env.GROQ_BASE_URL ?? GROQ_BASE_URL,
        apiKey: env.GROQ_API_KEY,
        model,
        maxTokensField: "max_completion_tokens",
        reasoningEffort: gptOss ? "low" : undefined,
        strictJsonSchema: gptOss,
        // Keep the reasoning out of the reply body; it still counts as output tokens.
        extraBody: gptOss ? { include_reasoning: false } : undefined,
        maxRequestTokens: env.GROQ_MAX_REQUEST_TOKENS ?? GROQ_DEFAULT_MAX_REQUEST_TOKENS,
        timeoutMs: 45_000,
      });
    }
    case "cloudflare": {
      if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) return null;
      const model = modelOverride ?? (tier === "fast" ? env.CLOUDFLARE_MODEL_FAST : env.CLOUDFLARE_MODEL_STRONG) ?? DEFAULT_MODELS.cloudflare[tier];
      const gptOss = isGptOss(model);
      const vision = env.CLOUDFLARE_VISION_MODEL ?? DEFAULT_CLOUDFLARE_VISION_MODEL;
      return new OpenAiCompatibleProvider({
        name: "cloudflare",
        baseUrl: cloudflareBaseUrl(env),
        apiKey: env.CLOUDFLARE_API_TOKEN,
        model,
        visionModel: vision.toLowerCase() === "off" ? undefined : vision,
        maxTokensField: "max_tokens",
        // Cloudflare documents its gpt-oss models on the Responses API.
        useResponsesApi: gptOss,
        reasoningEffort: gptOss ? "low" : undefined,
        // JSON mode is not documented for gpt-oss on Workers AI; the prompts ask
        // for JSON and every answer is validated (and repaired once) anyway.
        jsonObject: !gptOss,
        maxRequestTokens: CLOUDFLARE_MAX_REQUEST_TOKENS,
        timeoutMs: 100_000,
      });
    }
    case "ollama": {
      if (!env.OLLAMA_BASE_URL) return null;
      const model = modelOverride ?? (tier === "fast" ? env.OLLAMA_MODEL_FAST : env.OLLAMA_MODEL_STRONG) ?? DEFAULT_MODELS.ollama[tier];
      return new OpenAiCompatibleProvider({
        name: "ollama",
        baseUrl: env.OLLAMA_BASE_URL,
        model,
        maxTokensField: "max_tokens",
        maxRequestTokens: env.OLLAMA_CONTEXT_TOKENS ?? OLLAMA_DEFAULT_CONTEXT_TOKENS,
        timeoutMs: 120_000,
      });
    }
    case "anthropic":
      return env.ANTHROPIC_API_KEY ? new AnthropicProvider(env.ANTHROPIC_API_KEY, modelOverride ?? DEFAULT_MODELS.anthropic[tier]) : null;
    case "openai":
      return env.OPENAI_API_KEY ? new OpenAiProvider(env.OPENAI_API_KEY, modelOverride ?? DEFAULT_MODELS.openai[tier]) : null;
    case "google":
      return env.GOOGLE_AI_API_KEY ? new GoogleProvider(env.GOOGLE_AI_API_KEY, modelOverride ?? DEFAULT_MODELS.google[tier]) : null;
    case "mock":
      return new MockProvider();
  }
}

let warnedGoogle = false;

/** The automatic order, from AI_PROVIDER_ORDER when it is set. */
export function providerOrder(env: ServerEnv = getServerEnv()): AiProviderName[] {
  if (!env.AI_PROVIDER_ORDER) return [...DEFAULT_PROVIDER_ORDER];
  const names = env.AI_PROVIDER_ORDER.split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name): name is AiProviderName => (PROVIDER_NAMES as readonly string[]).includes(name) && name !== "mock");
  const unique = [...new Set(names)];
  if (unique.includes("google") && !warnedGoogle) {
    warnedGoogle = true;
    console.warn("ai: AI_PROVIDER_ORDER includes google. Gemini's terms bar apps likely used by people under 18; check before enabling it for students.");
  }
  return unique.length > 0 ? unique : [...DEFAULT_PROVIDER_ORDER];
}

export type AiSetup = {
  mode: "pinned" | "auto" | "mock" | "none";
  /** Providers a request may use, in order. */
  providers: AiProviderName[];
};

/** Which providers this server will use (names only; never keys). */
export function describeAiSetup(env: ServerEnv = getServerEnv()): AiSetup {
  const pinned = env.AI_PROVIDER && env.AI_PROVIDER !== "auto" ? env.AI_PROVIDER : null;
  if (pinned === "mock") return { mode: "mock", providers: ["mock"] };
  if (pinned) return { mode: buildProvider(pinned, "fast", env) ? "pinned" : "none", providers: [pinned] };
  const providers = providerOrder(env).filter((name) => buildProvider(name, "fast", env) !== null);
  if (providers.length > 0) return { mode: "auto", providers };
  return process.env.NODE_ENV !== "production" ? { mode: "mock", providers: ["mock"] } : { mode: "none", providers: [] };
}

export function isAiConfigured(): boolean {
  return describeAiSetup().mode !== "none";
}

/**
 * The AI provider for a tier: every configured provider behind one router,
 * metered against the signed-in student's daily allowance. AI_PROVIDER pins
 * all requests to one provider (AI_MODEL_FAST / AI_MODEL_STRONG then pick its
 * models). Throws a student-safe AiError when nothing is configured.
 */
export function getAiProvider(tier: AiTier = "strong"): AiProvider {
  const env = getServerEnv();
  const pinned = env.AI_PROVIDER && env.AI_PROVIDER !== "auto" ? env.AI_PROVIDER : null;

  if (pinned) {
    const override = tier === "fast" ? env.AI_MODEL_FAST : env.AI_MODEL_STRONG;
    const provider = buildProvider(pinned, tier, env, pinned === "mock" ? undefined : override);
    if (!provider) throw new AiError("not_configured", `AI_PROVIDER=${pinned}, but its key or URL is missing`);
    return new MeteredProvider(provider);
  }

  const candidates = providerOrder(env)
    .map((name) => buildProvider(name, tier, env))
    .filter((provider): provider is AiProvider => provider !== null);

  if (candidates.length === 0) {
    if (process.env.NODE_ENV !== "production") return new MeteredProvider(new MockProvider());
    throw new AiError("not_configured", "No AI provider configured");
  }
  return new MeteredProvider(candidates.length === 1 ? candidates[0] : new AiRouter(candidates));
}
