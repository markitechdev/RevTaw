import { fileTypeFromBuffer } from "file-type";
import { NextResponse } from "next/server";

import { isAiError } from "@/lib/ai/errors";
import { consumeAiRequest, recordAiTokens, refundAiRequest } from "@/lib/ai/quota";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";
import { transcribeAudio, voiceCapabilities } from "@/lib/voice/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A 30-second Opus clip is about 120 KB; this leaves room for AAC on iPhone. */
const MAX_BYTES = 4 * 1024 * 1024;

/** Audio Whisper accepts, by detected type (file-type reports WebM as video/webm). */
const ACCEPTED: Record<string, string> = {
  "video/webm": "audio/webm",
  "audio/webm": "audio/webm",
  "audio/ogg": "audio/ogg",
  "audio/opus": "audio/ogg",
  "audio/mp4": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "video/mp4": "audio/mp4",
  "audio/mpeg": "audio/mpeg",
  "audio/wav": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/flac": "audio/flac",
  "audio/x-flac": "audio/flac",
};

/**
 * Speech-to-text for browsers without Web Speech: a short recording in,
 * text out (Groq Whisper, then Cloudflare). The audio is not stored.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!voiceCapabilities().transcribe) {
    return NextResponse.json({ error: "Voice typing isn't set up on this server. Type your question instead." }, { status: 503 });
  }
  const limit = rateLimit(`voice:${user.id}`, 40, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "That's a lot of voice messages. Please wait a little." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  }

  const form = await request.formData().catch(() => null);
  const clip = form?.get("audio");
  const language = String(form?.get("language") ?? "").slice(0, 20) || null;
  if (!(clip instanceof Blob) || clip.size === 0) {
    return NextResponse.json({ error: "No recording was received." }, { status: 400 });
  }
  if (clip.size > MAX_BYTES) {
    return NextResponse.json({ error: "That recording is too long. Keep voice questions under 30 seconds." }, { status: 413 });
  }
  const bytes = new Uint8Array(await clip.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);
  const mime = detected ? ACCEPTED[detected.mime] : undefined;
  if (!mime) {
    return NextResponse.json({ error: "That recording format isn't supported." }, { status: 415 });
  }

  let ticket: Awaited<ReturnType<typeof consumeAiRequest>> = null;
  try {
    ticket = await consumeAiRequest("voice");
    const transcript = await transcribeAudio(bytes, mime, language, request.signal);
    // For voice, the allowance's input column counts seconds heard.
    recordAiTokens("voice", { inputTokens: Math.round(transcript.seconds ?? 0), outputTokens: 0 });
    return NextResponse.json({ text: transcript.text }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (isAiError(error)) {
      if (error.code === "quota_exceeded") return NextResponse.json({ error: error.message }, { status: 429 });
      if (ticket) refundAiRequest(ticket);
      const status = error.code === "not_configured" ? 503 : 502;
      return NextResponse.json({ error: "I couldn't turn that recording into text. Try again, or type your question." }, { status });
    }
    console.error("voice: transcription failed", error);
    return NextResponse.json({ error: "I couldn't turn that recording into text. Try again, or type your question." }, { status: 500 });
  }
}
