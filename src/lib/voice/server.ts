import "server-only";

import { AiError, isAiError } from "@/lib/ai/errors";
import { fetchWithTimeout, statusToAiError } from "@/lib/ai/providers/http";
import { coolingDownUntil, startCooldown } from "@/lib/ai/router";
import { getServerEnv, type ServerEnv } from "@/lib/env";

/**
 * Server fallback for voice (research doc §15). The browser's Web Speech
 * stays the first choice; this runs only where it is missing:
 *
 *   speech-to-text  Groq Whisper large-v3-turbo, then Cloudflare's Whisper
 *                   (Groq first: its Whisper quota is separate from its text
 *                   models, while Cloudflare's daily Neurons are shared)
 *
 * Audio is never stored. Keys stay in server environment variables.
 */

export type VoiceCapabilities = { transcribe: boolean };

export const GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";
export const CLOUDFLARE_WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

/** Names and words Whisper should spell RevTaw's way. */
const WHISPER_PROMPT = "Tamari, RevTaw, Bitaw, reviewer, quiz, flashcards, planner, Pomodoro.";

function cloudflareConfigured(env: ServerEnv): boolean {
  return Boolean(env.CLOUDFLARE_API_TOKEN && (env.CLOUDFLARE_ACCOUNT_ID || env.CLOUDFLARE_AI_BASE_URL));
}

export function voiceCapabilities(env: ServerEnv = getServerEnv()): VoiceCapabilities {
  return { transcribe: Boolean(env.GROQ_API_KEY) || cloudflareConfigured(env) };
}

/** Whisper's language code from a BCP 47 tag: Filipino and Tagalog are "tl"; unknown means auto-detect. */
export function whisperLanguage(tag: string | null | undefined): string | undefined {
  const base = (tag ?? "").toLowerCase().split(/[-_]/)[0];
  if (base === "fil" || base === "tl") return "tl";
  if (base === "en") return "en";
  return undefined;
}

const EXTENSION: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

export type Transcript = { text: string; provider: string; model: string; seconds: number | null };

type GroqTranscription = { text?: string; duration?: number; x_groq?: unknown };
type CloudflareTranscription = { result?: { text?: string; transcription_info?: { duration?: number } }; text?: string };

async function transcribeWithGroq(env: ServerEnv, audio: Uint8Array, mime: string, language: string | undefined, signal?: AbortSignal): Promise<Transcript> {
  const form = new FormData();
  form.set("file", new Blob([audio as BlobPart], { type: mime }), `speech.${EXTENSION[mime] ?? "webm"}`);
  form.set("model", GROQ_WHISPER_MODEL);
  form.set("response_format", "json");
  form.set("temperature", "0");
  form.set("prompt", WHISPER_PROMPT);
  if (language) form.set("language", language);
  const base = (env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  const response = await fetchWithTimeout(`${base}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${env.GROQ_API_KEY}` }, body: form }, signal, 30_000);
  if (!response.ok) throw await statusToAiError("groq whisper", response);
  const data = (await response.json().catch(() => null)) as GroqTranscription | null;
  return { text: (data?.text ?? "").trim(), provider: "groq", model: GROQ_WHISPER_MODEL, seconds: typeof data?.duration === "number" ? data.duration : null };
}

/** Workers AI's native run endpoint (Whisper is not on its OpenAI-compatible API). */
export function cloudflareRunUrl(env: ServerEnv, model: string): string {
  const base = env.CLOUDFLARE_AI_BASE_URL
    ? env.CLOUDFLARE_AI_BASE_URL.replace(/\/+$/, "").replace(/\/v1$/, "/run")
    : `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID ?? "")}/ai/run`;
  return `${base}/${model}`;
}

async function transcribeWithCloudflare(env: ServerEnv, audio: Uint8Array, language: string | undefined, signal?: AbortSignal): Promise<Transcript> {
  const body = {
    audio: Buffer.from(audio).toString("base64"),
    ...(language ? { language } : {}),
    initial_prompt: WHISPER_PROMPT,
    vad_filter: true,
  };
  const response = await fetchWithTimeout(
    cloudflareRunUrl(env, CLOUDFLARE_WHISPER_MODEL),
    { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, body: JSON.stringify(body) },
    signal,
    45_000,
  );
  if (!response.ok) throw await statusToAiError("cloudflare whisper", response);
  const data = (await response.json().catch(() => null)) as CloudflareTranscription | null;
  const text = (data?.result?.text ?? data?.text ?? "").trim();
  const seconds = data?.result?.transcription_info?.duration;
  return { text, provider: "cloudflare", model: CLOUDFLARE_WHISPER_MODEL, seconds: typeof seconds === "number" ? seconds : null };
}

/**
 * Turns a short recording into text: Groq first, Cloudflare second, each
 * skipped while cooling down after a 429 or an outage. Throws the last
 * provider's AiError when both fail.
 */
export async function transcribeAudio(audio: Uint8Array, mime: string, languageTag?: string | null, signal?: AbortSignal): Promise<Transcript> {
  const env = getServerEnv();
  const language = whisperLanguage(languageTag);
  const attempts: Array<{ name: string; model: string; run: () => Promise<Transcript> }> = [];
  if (env.GROQ_API_KEY) attempts.push({ name: "groq", model: GROQ_WHISPER_MODEL, run: () => transcribeWithGroq(env, audio, mime, language, signal) });
  if (cloudflareConfigured(env)) attempts.push({ name: "cloudflare", model: CLOUDFLARE_WHISPER_MODEL, run: () => transcribeWithCloudflare(env, audio, language, signal) });
  if (attempts.length === 0) throw new AiError("not_configured", "speech-to-text needs GROQ_API_KEY or Cloudflare Workers AI", false);

  let lastError: AiError | null = null;
  for (const attempt of attempts) {
    if (coolingDownUntil(attempt) !== null) continue;
    try {
      return await attempt.run();
    } catch (error) {
      if (signal?.aborted || !isAiError(error)) throw error;
      lastError = error;
      startCooldown(attempt, error);
      console.warn(`voice: ${attempt.name} transcription failed: ${error.code}${error.detail ? ` — ${error.detail.slice(0, 200)}` : ""}`);
    }
  }
  throw lastError ?? new AiError("rate_limited", "every speech-to-text provider is cooling down");
}
