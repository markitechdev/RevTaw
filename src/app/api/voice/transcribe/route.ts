import { fileTypeFromBuffer } from "file-type";
import { NextResponse } from "next/server";

import { isAiError } from "@/lib/ai/errors";
import { checkVoiceBudget, consumeAiRequest, recordAiTokens, refundAiRequest } from "@/lib/ai/quota";
import { track } from "@/lib/analytics/server";
import { rateLimit } from "@/lib/rate-limit";
import { readFormWithLimit } from "@/lib/server/read-body";
import { getCurrentUser } from "@/lib/supabase/server";
import { countedVoiceSeconds, transcribeAudio, voiceCapabilities } from "@/lib/voice/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * RevTaw's recorder stops at 30 seconds and records about 48 kbps (near
 * 180 KB); 1 MB leaves room for browsers that ignore the bitrate.
 */
const MAX_BYTES = 1024 * 1024;
/** Room for the multipart boundaries, headers and the language field around the clip. */
const FORM_OVERHEAD_BYTES = 64 * 1024;
const TOO_LONG = "That recording is too long. Keep voice questions under 30 seconds.";

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

const FAILED = "I couldn't turn that recording into text. Try again, or type your question.";

/**
 * Speech-to-text for browsers without Web Speech: a short recording in,
 * text out (Groq Whisper, then Cloudflare). The audio is not stored. Each
 * clip takes one voice request and its seconds from the student's day.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!voiceCapabilities().transcribe) {
    return NextResponse.json({ error: "Voice typing isn't set up on this server. Type your question instead." }, { status: 503 });
  }
  const limit = await rateLimit(`voice:${user.id}`, 40, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "That's a lot of voice messages. Please wait a little." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  }
  // Counted while reading, so a body without (or with a false) Content-Length is never buffered past the limit.
  const form = await readFormWithLimit(request, MAX_BYTES + FORM_OVERHEAD_BYTES);
  if (form === null) {
    return NextResponse.json({ error: TOO_LONG }, { status: 413 });
  }
  const clip = form === "invalid" ? null : form.get("audio");
  const language = form === "invalid" ? null : String(form.get("language") ?? "").slice(0, 20) || null;
  if (!(clip instanceof Blob) || clip.size === 0) {
    return NextResponse.json({ error: "No recording was received." }, { status: 400 });
  }
  if (clip.size > MAX_BYTES) {
    return NextResponse.json({ error: TOO_LONG }, { status: 413 });
  }
  const bytes = new Uint8Array(await clip.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);
  const mime = detected ? ACCEPTED[detected.mime] : undefined;
  if (!mime) {
    return NextResponse.json({ error: "That recording format isn't supported." }, { status: 415 });
  }

  let ticket: Awaited<ReturnType<typeof consumeAiRequest>> = null;
  try {
    await checkVoiceBudget(user.id, { seconds: true });
    ticket = await consumeAiRequest("voice");
    const transcript = await transcribeAudio(bytes, mime, language, request.signal);
    // For voice, the allowance's input column counts seconds heard.
    recordAiTokens("voice", { inputTokens: countedVoiceSeconds(transcript.seconds, bytes.byteLength), outputTokens: 0 }, user.id);
    track(user.id, "voice_transcribed", { provider: transcript.provider });
    return NextResponse.json({ text: transcript.text }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (isAiError(error)) {
      if (error.code === "quota_exceeded") {
        return NextResponse.json({ error: error.message }, { status: 429, headers: error.retryAfterSeconds ? { "retry-after": String(error.retryAfterSeconds) } : undefined });
      }
      if (request.signal.aborted) {
        // Canceled mid-way: the provider may have heard the clip already,
        // so it still counts and the request is not given back.
        if (ticket) recordAiTokens("voice", { inputTokens: countedVoiceSeconds(null, bytes.byteLength), outputTokens: 0 }, user.id);
      } else if (ticket) {
        refundAiRequest(ticket);
      }
      return NextResponse.json({ error: FAILED }, { status: error.code === "not_configured" ? 503 : 502 });
    }
    console.error("voice: transcription failed", error);
    return NextResponse.json({ error: FAILED }, { status: 500 });
  }
}
