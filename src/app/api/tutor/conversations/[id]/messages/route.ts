import { NextResponse } from "next/server";
import { z } from "zod";

import { pageContextSchema } from "@/lib/assistant/context-schema";
import { resolvePageContext } from "@/lib/assistant/context";
import { studySnapshot } from "@/lib/assistant/snapshot";
import { asksAboutStudyData } from "@/lib/assistant/study-question";
import { ServiceError } from "@/lib/errors";
import { getClientAddress, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";
import { getConversation } from "@/lib/tutor/queries";
import { sendMessage } from "@/lib/tutor/service";
import { TUTOR_ACTION_IDS } from "@/lib/tutor/types";

export const maxDuration = 120;
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  message: z.string().trim().max(6000).default(""),
  action: z.enum(TUTOR_ACTION_IDS).nullable().default(null),
  selection: z.string().trim().max(4000).nullable().default(null),
  /** Ask RevTaw: the page the student asked from (ids only; resolved with their session). */
  context: pageContextSchema.nullable().default(null),
  /** The answer a follow-up button was pressed under ("Example", "Simplify"…), so the follow-up is about it. */
  replyTo: z.uuid().nullable().default(null),
});

/** The conversation's messages, for reopening it in Ask RevTaw. */
export async function GET(_request: Request, context: RouteContext<"/api/tutor/conversations/[id]/messages">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
  }
  const conversation = await getConversation(params.data.id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  return NextResponse.json(
    { conversation: { id: conversation.id, title: conversation.title, material: conversation.material ? { id: conversation.material.id, title: conversation.material.title } : null }, messages: conversation.messages.slice(-60) },
    { headers: { "cache-control": "private, no-store" } },
  );
}

/** Sends a student message and returns the tutor's grounded reply. */
export async function POST(request: Request, context: RouteContext<"/api/tutor/conversations/[id]/messages">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Type a question or pick an action." }, { status: 400 });
  }
  if (!body.data.message && !body.data.action) {
    return NextResponse.json({ error: "Type a question or pick an action." }, { status: 400 });
  }
  const ip = await getClientAddress();
  const limit = await rateLimit(`tutor:${user.id}:${ip}`, 120, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "You have sent a lot of messages. Please wait a little." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  }
  try {
    // The page the student asked from, plus their study data when the question is about it ("what am I weak at?").
    const [page, snapshot] = await Promise.all([resolvePageContext(body.data.context), asksAboutStudyData(body.data.message) ? studySnapshot() : null]);
    const pageNote = [page.note, snapshot].filter(Boolean).join("\n\n") || null;
    const result = await sendMessage({ conversationId: params.data.id, content: body.data.message, action: body.data.action, selection: body.data.selection, pageNote, replyTo: body.data.replyTo });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("tutor: send message failed", error);
    return NextResponse.json({ error: "Tamari could not reply. Please try again." }, { status: 500 });
  }
}
