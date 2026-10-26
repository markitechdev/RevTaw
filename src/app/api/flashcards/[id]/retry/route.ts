import { NextResponse } from "next/server";
import { z } from "zod";

import { ServiceError } from "@/lib/errors";
import { FLASHCARD_MAX, FLASHCARD_MIN } from "@/lib/flashcards/constants";
import { retryDeck } from "@/lib/flashcards/service";
import { getClientAddress, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

export const maxDuration = 120;
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });
// Both optional: a retry without them makes the deck the student asked for the first time.
const bodySchema = z.object({ count: z.number().int().min(FLASHCARD_MIN).max(FLASHCARD_MAX).optional(), focus: z.string().trim().max(200).nullable().optional() });

/** Re-runs generation for a failed deck. */
export async function POST(request: Request, context: RouteContext<"/api/flashcards/[id]/retry">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid deck id." }, { status: 400 });
  }
  const body = bodySchema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!body.success) {
    return NextResponse.json({ error: "Invalid options." }, { status: 400 });
  }
  const ip = await getClientAddress();
  const limit = await rateLimit(`generate:${user.id}:${ip}`, 30, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many generation requests. Please wait a little." }, { status: 429 });
  }
  try {
    const result = await retryDeck(params.data.id, body.data);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("flashcards: retry route failed", error);
    return NextResponse.json({ error: "The deck could not be regenerated. Please try again." }, { status: 500 });
  }
}
