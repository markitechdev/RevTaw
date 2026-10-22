import "server-only";

import { buildProvider, describeAiSetup } from "@/lib/ai";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, embeddingsConfigured, embedTexts } from "@/lib/ai/embeddings";
import { isAiError } from "@/lib/ai/errors";
import { getDailyLimits, parseVoiceAllowance } from "@/lib/ai/quota";
import { cooldownSnapshot, recentRoutes } from "@/lib/ai/router";
import type { AiTier } from "@/lib/ai/types";
import { analyticsConfigured } from "@/lib/analytics/server";
import { calendarConfigured } from "@/lib/calendar/google";
import { getPublicSiteUrl, getServerEnv } from "@/lib/env";
import { emailConfig } from "@/lib/notifications/email-config";
import { cronSecret } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { azureVoiceListed, synthesizeSpeech, transcribeAudio, voiceCapabilities } from "@/lib/voice/server";

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

/** Embeds one short text and checks the vector's size. */
export async function checkEmbeddings(): Promise<LiveCheck | null> {
  if (!embeddingsConfigured()) return null;
  return timed("embeddings", "cloudflare", EMBEDDING_MODEL, async () => {
    const [vector] = await embedTexts(["Tamari, saan nangyayari ang Calvin cycle?"], { timeoutMs: 15_000 });
    return `${vector.length} dimensions (expected ${EMBEDDING_DIMENSIONS})`;
  });
}

/** Whether search can use embeddings, and how many chunks still wait for one (needs the secret key). */
export async function embeddingsSummary() {
  const admin = createAdminClient();
  let waiting: number | null = null;
  if (admin) {
    const { count, error } = await admin.from("material_chunks").select("id", { count: "exact", head: true }).is("embedding", null);
    waiting = error ? null : (count ?? 0);
  }
  return { configured: embeddingsConfigured(), model: EMBEDDING_MODEL, chunksWithoutEmbedding: waiting };
}

/** One second of a quiet 440 Hz tone (16 kHz mono WAV): enough for Whisper to answer, with or without words. */
function testTone(): Uint8Array {
  const rate = 16_000;
  const samples = rate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * index) / rate) * 3000), 44 + index * 2);
  return new Uint8Array(buffer);
}

/** Speech-to-text with a test tone, and the Filipino voice (listed and speaking). */
export async function checkVoice(): Promise<LiveCheck[]> {
  const capabilities = voiceCapabilities();
  const checks: Array<Promise<LiveCheck>> = [];
  if (capabilities.transcribe) {
    checks.push(
      timed("speech-to-text", "groq → cloudflare", "whisper-large-v3-turbo", async () => {
        const transcript = await transcribeAudio(testTone(), "audio/wav", "fil-PH");
        return `answered by ${transcript.provider} (${transcript.text ? `"${transcript.text}"` : "no words, as expected"})`;
      }),
    );
  }
  if (capabilities.speak) {
    checks.push(
      timed("text-to-speech voice", "azure", "voice list", async () => {
        const { voice, listed } = await azureVoiceListed();
        if (!listed) throw new Error(`${voice} is not offered in this region; set AZURE_TTS_VOICE to one that is`);
        return `${voice} is available`;
      }),
      timed("text-to-speech", "azure", "fil-PH neural", async () => {
        const { audio, voice } = await synthesizeSpeech("Bitaw! Kaya mo 'yan.");
        return `${voice}: ${audio.byteLength} bytes of MP3`;
      }),
    );
  }
  return Promise.all(checks);
}

export function voiceSummary() {
  return { ...voiceCapabilities(), dailyBudget: parseVoiceAllowance(getServerEnv().AI_DAILY_LIMITS) ?? "off" };
}

/** Email, Google Calendar, analytics and the scheduler: configured or not (names only). */
export function otherServicesSummary() {
  const email = emailConfig();
  const sender = email?.from.match(/@([^>\s]+)/)?.[1] ?? null;
  return {
    // Emails and calendar events link back to RevTaw only when this is set.
    publicSiteUrl: { configured: getPublicSiteUrl() !== null },
    email: { configured: email !== null, provider: email ? "resend" : null, senderDomain: sender },
    calendar: { configured: calendarConfigured() },
    analytics: { configured: analyticsConfigured(), optIn: true },
    scheduler: { cronSecret: cronSecret() !== null, secretKey: Boolean(getServerEnv().SUPABASE_SECRET_KEY) },
  };
}
