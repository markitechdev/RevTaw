import { NextResponse } from "next/server";
import { z } from "zod";

import { FLASHCARD_MAX, FLASHCARD_MIN } from "@/lib/flashcards/constants";
import { createDeck, ServiceError } from "@/lib/flashcards/service";
import { getClientAddress, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

export const maxDuration = 120;
export const runtime = "nodejs";

const bodySchema = z.object({
  materialId: z.uuid(),
  count: z.number().int().min(FLASHCARD_MIN).max(FLASHCARD_MAX),
  focus: z.string().trim().max(200).nullable().default(null),
});

/** Generates a flashcard deck from a processed material. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Choose a material and a number of cards." }, { status: 400 });
  }
  const ip = await getClientAddress();
  const limit = rateLimit(`generate:${user.id}:${ip}`, 30, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You have generated a lot recently. Please wait a little before creating more." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }
  try {
    const result = await createDeck(body.data.materialId, { count: body.data.count, focus: body.data.focus });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("flashcards: create route failed", error);
    return NextResponse.json({ error: "The deck could not be created. Please try again." }, { status: 500 });
  }
}
