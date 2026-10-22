import "server-only";

import { AiError, isAiError } from "@/lib/ai/errors";
import { fetchWithTimeout, statusToAiError } from "@/lib/ai/providers/http";
import { coolingDownUntil, startCooldown } from "@/lib/ai/router";
import { getServerEnv, type ServerEnv } from "@/lib/env";

/**
 * Server fallbacks for voice (research doc §15). The browser's Web Speech
 * stays the first choice; these run only where it is missing:
 *
 *   speech-to-text  Groq Whisper large-v3-turbo, then Cloudflare's Whisper
 *                   (Groq first: its Whisper quota is separate from its text
 *                   models, while Cloudflare's daily Neurons are shared)
 *   text-to-speech  Azure AI Speech neural voices for Filipino
 *
 * Audio is never stored. Keys stay in server environment variables.
 */

export type VoiceCapabilities = { transcribe: boolean; speak: boolean };

export const GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";
export const CLOUDFLARE_WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
/** Female Filipino neural voice; fil-PH-AngeloNeural is the male one. Confirm with the voice list (service check). */
export const DEFAULT_AZURE_VOICE = "fil-PH-BlessicaNeural";
const AZURE_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

/** Names and words Whisper should spell RevTaw's way. */
const WHISPER_PROMPT = "Tamari, RevTaw, Bitaw, reviewer, quiz, flashcards, planner, Pomodoro.";

function cloudflareConfigured(env: ServerEnv): boolean {
  return Boolean(env.CLOUDFLARE_API_TOKEN && (env.CLOUDFLARE_ACCOUNT_ID || env.CLOUDFLARE_AI_BASE_URL));
}

function azureConfigured(env: ServerEnv): boolean {
  return Boolean(env.AZURE_SPEECH_KEY && (env.AZURE_SPEECH_REGION || env.AZURE_TTS_BASE_URL));
}

export function voiceCapabilities(env: ServerEnv = getServerEnv()): VoiceCapabilities {
  return { transcribe: Boolean(env.GROQ_API_KEY) || cloudflareConfigured(env), speak: azureConfigured(env) };
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

/** Escapes text for an SSML element. */
export function escapeSsml(text: string): string {
  return text.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}

export function buildSsml(text: string, voice: string): string {
  const lang = voice.split("-").slice(0, 2).join("-");
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}">${escapeSsml(text)}</voice></speak>`;
}

function azureBase(env: ServerEnv): string {
  return (env.AZURE_TTS_BASE_URL ?? `https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com`).replace(/\/+$/, "");
}

/** Reads text aloud with an Azure neural voice; returns MP3 bytes. */
export async function synthesizeSpeech(text: string, signal?: AbortSignal): Promise<{ audio: ArrayBuffer; voice: string }> {
  const env = getServerEnv();
  if (!azureConfigured(env)) throw new AiError("not_configured", "text-to-speech needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION", false);
  const voice = env.AZURE_TTS_VOICE ?? DEFAULT_AZURE_VOICE;
  const response = await fetchWithTimeout(
    `${azureBase(env)}/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY!,
        "content-type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": AZURE_OUTPUT_FORMAT,
        "user-agent": "RevTaw",
      },
      body: buildSsml(text, voice),
    },
    signal,
    30_000,
  );
  if (!response.ok) throw await statusToAiError("azure speech", response);
  return { audio: await response.arrayBuffer(), voice };
}

/** Whether the configured voice exists in the region (for the service check). */
export async function azureVoiceListed(): Promise<{ voice: string; listed: boolean }> {
  const env = getServerEnv();
  if (!azureConfigured(env)) throw new AiError("not_configured", "Azure Speech is not configured", false);
  const voice = env.AZURE_TTS_VOICE ?? DEFAULT_AZURE_VOICE;
  const response = await fetchWithTimeout(`${azureBase(env)}/cognitiveservices/voices/list`, { headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY! } }, undefined, 15_000);
  if (!response.ok) throw await statusToAiError("azure speech", response);
  const voices = (await response.json().catch(() => [])) as Array<{ ShortName?: string }>;
  return { voice, listed: voices.some((entry) => entry.ShortName === voice) };
}
