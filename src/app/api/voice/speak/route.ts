import { NextResponse } from "next/server";
import { z } from "zod";

import { isAiError } from "@/lib/ai/errors";
import { checkVoiceBudget, consumeAiRequest, recordAiTokens, refundAiRequest } from "@/lib/ai/quota";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";
import { synthesizeSpeech, voiceCapabilities } from "@/lib/voice/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(1_500),
  // The server voice is Filipino; English always has a browser voice.
  language: z.string().regex(/^(fil|tl)([-_][A-Za-z]{2})?$/i),
});

const FAILED = "RevTaw couldn't read that aloud right now.";

/**
 * Filipino text-to-speech for devices without a Filipino voice: text in,
 * MP3 out, read by Azure's fil-PH neural voice. Nothing is stored. Each
 * piece takes one voice request and its characters from the student's day
 * (Azure's free tier is 0.5 million characters a month).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!voiceCapabilities().speak) {
    return NextResponse.json({ error: "Reading aloud in Filipino isn't set up on this server." }, { status: 503 });
  }
  const limit = await rateLimit(`voice-speak:${user.id}`, 60, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "That's a lot to read aloud. Please wait a little." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Nothing to read aloud." }, { status: 400 });
  }
  const characters = body.data.text.length;

  let ticket: Awaited<ReturnType<typeof consumeAiRequest>> = null;
  try {
    await checkVoiceBudget(user.id, { characters });
    ticket = await consumeAiRequest("voice");
    const { audio } = await synthesizeSpeech(body.data.text, request.signal);
    // For voice, the allowance's output column counts characters read aloud.
    recordAiTokens("voice", { inputTokens: 0, outputTokens: characters }, user.id);
    return new Response(audio, { headers: { "content-type": "audio/mpeg", "content-length": String(audio.byteLength), "cache-control": "no-store" } });
  } catch (error) {
    if (isAiError(error)) {
      if (error.code === "quota_exceeded") {
        return NextResponse.json({ error: error.message }, { status: 429, headers: error.retryAfterSeconds ? { "retry-after": String(error.retryAfterSeconds) } : undefined });
      }
      if (request.signal.aborted) {
        // Cancelled mid-way: Azure may have read it already, so it still counts.
        if (ticket) recordAiTokens("voice", { inputTokens: 0, outputTokens: characters }, user.id);
      } else if (ticket) {
        refundAiRequest(ticket);
      }
      return NextResponse.json({ error: FAILED }, { status: error.code === "not_configured" ? 503 : 502 });
    }
    console.error("voice: speech synthesis failed", error);
    return NextResponse.json({ error: FAILED }, { status: 500 });
  }
}
