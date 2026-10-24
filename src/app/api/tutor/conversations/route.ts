import { NextResponse } from "next/server";
import { z } from "zod";

import { pageContextSchema } from "@/lib/assistant/context-schema";
import { resolvePageContext } from "@/lib/assistant/context";
import { studySnapshot } from "@/lib/assistant/snapshot";
import { asksAboutStudyData } from "@/lib/assistant/study-question";
import { ServiceError } from "@/lib/errors";
import { getClientAddress, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";
import { listConversations } from "@/lib/tutor/queries";
import { conversationHeader, createConversation, latestMaterialConversation, sendMessage } from "@/lib/tutor/service";
import { TUTOR_ACTION_IDS } from "@/lib/tutor/types";

export const maxDuration = 120;
export const runtime = "nodejs";

const bodySchema = z.object({
  materialId: z.uuid().nullable().default(null),
  mode: z.enum(["tutor", "guided"]).default("tutor"),
  message: z.string().trim().max(6000).nullable().default(null),
  action: z.enum(TUTOR_ACTION_IDS).nullable().default(null),
  selection: z.string().trim().max(4000).nullable().default(null),
  /** Ask RevTaw: the page the student asked from (ids only; resolved with their session). */
  context: pageContextSchema.nullable().default(null),
  /** Continue the latest chat on the material instead of starting one (highlight-and-ask). */
  reuse: z.boolean().default(false),
});

/** Recent conversations, for Ask RevTaw's history. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const limit = Math.max(1, Math.min(30, Number(new URL(request.url).searchParams.get("limit") ?? 10) || 10));
  const conversations = await listConversations({ limit });
  return NextResponse.json(
    { conversations: conversations.filter((item) => !item.session_id).map((item) => ({ id: item.id, title: item.title, materialTitle: item.material?.title ?? null, lastMessageAt: item.last_message_at, messageCount: item.message_count })) },
    { headers: { "cache-control": "private, no-store" } },
  );
}

/** Starts a tutor conversation (or continues the latest one on the material with `reuse`), optionally with a first question, and returns the reply. */
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
  const limit = await rateLimit(`tutor:${user.id}:${ip}`, 120, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "You have sent a lot of messages. Please wait a little." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  }
  try {
    // The page the student asked from, plus their study data when the question is about it ("what am I weak at?").
    const [page, snapshot] = await Promise.all([resolvePageContext(body.data.context), body.data.message && asksAboutStudyData(body.data.message) ? studySnapshot() : null]);
    const pageNote = [page.note, snapshot].filter(Boolean).join("\n\n") || null;
    const materialId = body.data.materialId ?? page.materialId;
    const existing = body.data.reuse && materialId ? await latestMaterialConversation(materialId) : null;
    const id = existing ?? (await createConversation({ materialId, mode: body.data.mode })).id;
    const result = body.data.message || body.data.action ? await sendMessage({ conversationId: id, content: body.data.message ?? "", action: body.data.action, selection: body.data.selection, pageNote }) : null;
    const conversation = await conversationHeader(id);
    return NextResponse.json({ id, conversation, reused: existing !== null, ...(result ?? {}) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("tutor: create conversation failed", error);
    return NextResponse.json({ error: "The conversation could not be started. Please try again." }, { status: 500 });
  }
}
