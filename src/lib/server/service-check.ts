import "server-only";

import { buildProvider, describeAiSetup } from "@/lib/ai";
import { isAiError } from "@/lib/ai/errors";
import { getDailyLimits } from "@/lib/ai/quota";
import { cooldownSnapshot, recentRoutes } from "@/lib/ai/router";
import type { AiTier } from "@/lib/ai/types";

/**
 * The service check behind /api/system/services: which providers this
 * server is set up to use and, on request, a tiny live call to each one.
 * It reports names, models and outcomes only — never keys, prompts or
 * student data.
 */

/** A 16×16 red square, to confirm a vision model accepts images. */
const RED_SQUARE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mO4IydHEmIY1TCqYfhqAACaMxgQdrf9VwAAAABJRU5ErkJggg==";

export type LiveCheck = {
  service: string;
  provider: string;
  model: string;
  ok: boolean;
  ms: number;
  answer?: string;
  error?: string;
};

function describeError(error: unknown): string {
  if (isAiError(error)) return `${error.code}${error.detail ? `: ${error.detail.slice(0, 240)}` : ""}`;
  return error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
}

async function timed(service: string, provider: string, model: string, run: () => Promise<string>): Promise<LiveCheck> {
  const started = Date.now();
  try {
    const answer = await run();
    return { service, provider, model, ok: true, ms: Date.now() - started, answer: answer.replace(/\s+/g, " ").slice(0, 60) };
  } catch (error) {
    return { service, provider, model, ok: false, ms: Date.now() - started, error: describeError(error) };
  }
}

/** One short request per configured text provider and tier, plus a vision check where a vision model is set. */
export async function checkAiProviders(): Promise<LiveCheck[]> {
  const setup = describeAiSetup();
  const checks: Array<Promise<LiveCheck>> = [];
  for (const name of setup.providers) {
    if (name === "mock") continue;
    for (const tier of ["fast", "strong"] as AiTier[]) {
      const provider = buildProvider(name, tier);
      if (!provider) continue;
      checks.push(
        timed(`ai text (${tier})`, provider.name, provider.model, async () => {
          const result = await provider.generate({
            task: "service_check",
            system: "You are a connection test. Reply with the single word OK.",
            messages: [{ role: "user", content: "Reply with OK." }],
            maxTokens: 24,
            temperature: 0,
          });
          return result.text;
        }),
      );
      if (tier === "fast" && provider.supportsVision) {
        checks.push(
          timed("ai vision", provider.name, `${provider.name} vision model`, async () => {
            const result = await provider.generate({
              task: "service_check",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "image", mimeType: "image/png", data: RED_SQUARE_PNG },
                    { type: "text", text: "What color is this image? Answer with one word." },
                  ],
                },
              ],
              maxTokens: 16,
              temperature: 0,
            });
            return result.text;
          }),
        );
      }
    }
  }
  return Promise.all(checks);
}

export function aiSummary() {
  const setup = describeAiSetup();
  const limits = getDailyLimits();
  return {
    mode: setup.mode,
    providers: setup.providers,
    dailyLimits: limits ?? "off",
    cooldowns: cooldownSnapshot(),
    recentRoutes: recentRoutes().slice(0, 15),
  };
}
