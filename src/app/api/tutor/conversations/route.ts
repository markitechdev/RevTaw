import { NextResponse } from "next/server";
import { z } from "zod";

import { getClientAddress, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";
import { createConversation, sendMessage, ServiceError } from "@/lib/tutor/service";
import { TUTOR_ACTION_IDS } from "@/lib/tutor/types";

export const maxDuration = 120;
export const runtime = "nodejs";

const bodySchema = z.object({
  materialId: z.uuid().nullable().default(null),
  mode: z.enum(["tutor", "guided"]).default("tutor"),
  message: z.string().trim().max(6000).nullable().default(null),
  action: z.enum(TUTOR_ACTION_IDS).nullable().default(null),
  selection: z.string().trim().max(4000).nullable().default(null),
});

/** Starts a tutor conversation, optionally with a first question. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Check the conversation settings." }, { status: 400 });
  }
  const ip = await getClientAddress();
  const limit = rateLimit(`tutor:${user.id}:${ip}`, 120, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "You have sent a lot of messages. Please wait a little." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  }
  try {
    const { id } = await createConversation({ materialId: body.data.materialId, mode: body.data.mode });
    if (body.data.message || body.data.action) {
      await sendMessage({ conversationId: id, content: body.data.message ?? "", action: body.data.action, selection: body.data.selection });
    }
    return NextResponse.json({ id }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("tutor: create conversation failed", error);
    return NextResponse.json({ error: "The conversation could not be started. Please try again." }, { status: 500 });
  }
}
