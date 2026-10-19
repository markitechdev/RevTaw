import "server-only";

import { AiError } from "@/lib/ai/errors";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { GoogleProvider } from "@/lib/ai/providers/google";
import { MockProvider } from "@/lib/ai/providers/mock";
import { OpenAiProvider } from "@/lib/ai/providers/openai";
import type { AiProvider, AiTier } from "@/lib/ai/types";
import { getServerEnv } from "@/lib/env";

export type { AiProvider, AiTier } from "@/lib/ai/types";
export { AiError, isAiError } from "@/lib/ai/errors";

/**
 * Default models per provider and tier. Override with AI_MODEL_FAST /
 * AI_MODEL_STRONG. "fast" is for cheap, simple tasks (OCR, short rewrites);
 * "strong" for educational reasoning (analysis, quiz generation, tutoring).
 */
const DEFAULT_MODELS: Record<"anthropic" | "openai" | "google", Record<AiTier, string>> = {
  anthropic: { fast: "claude-haiku-4-5", strong: "claude-sonnet-4-5" },
  openai: { fast: "gpt-4.1-mini", strong: "gpt-4.1" },
  google: { fast: "gemini-2.5-flash", strong: "gemini-2.5-pro" },
};

export type AiProviderName = "anthropic" | "openai" | "google" | "mock";

/** Which provider the environment selects, or null when none is usable. */
export function resolveProviderName(): AiProviderName | null {
  const env = getServerEnv();
  const explicit = env.AI_PROVIDER;
  if (explicit) return explicit;

  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.OPENAI_API_KEY) return "openai";
  if (env.GOOGLE_AI_API_KEY) return "google";
  if (process.env.NODE_ENV !== "production") return "mock";
  return null;
}

export function isAiConfigured(): boolean {
  return resolveProviderName() !== null;
}

/**
 * Returns the configured provider for the requested tier. Throws an AiError
 * with a student-safe message when nothing is configured.
 */
export function getAiProvider(tier: AiTier = "strong"): AiProvider {
  const env = getServerEnv();
  const name = resolveProviderName();
  const override = tier === "fast" ? env.AI_MODEL_FAST : env.AI_MODEL_STRONG;

  switch (name) {
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) throw new AiError("not_configured", "ANTHROPIC_API_KEY missing");
      return new AnthropicProvider(env.ANTHROPIC_API_KEY, override ?? DEFAULT_MODELS.anthropic[tier]);
    case "openai":
      if (!env.OPENAI_API_KEY) throw new AiError("not_configured", "OPENAI_API_KEY missing");
      return new OpenAiProvider(env.OPENAI_API_KEY, override ?? DEFAULT_MODELS.openai[tier]);
    case "google":
      if (!env.GOOGLE_AI_API_KEY) throw new AiError("not_configured", "GOOGLE_AI_API_KEY missing");
      return new GoogleProvider(env.GOOGLE_AI_API_KEY, override ?? DEFAULT_MODELS.google[tier]);
    case "mock":
      return new MockProvider();
    default:
      throw new AiError("not_configured", "No AI provider configured");
  }
}
