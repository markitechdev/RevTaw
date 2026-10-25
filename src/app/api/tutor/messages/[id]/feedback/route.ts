import { NextResponse } from "next/server";
import { z } from "zod";

import { track } from "@/lib/analytics/server";
import { rateLimit } from "@/lib/rate-limit";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ helpful: z.boolean() });

/**
 * "Helpful" / "Not helpful" on one of Tamari's answers. Recorded only as a usage-analytics event (with the
 * student's consent, and never with the answer's text): whether it helped, the chat mode, where the answer
 * came from and which AI wrote it — enough to see which kinds of answers miss.
 */
export async function POST(request: Request, context: RouteContext<"/api/tutor/messages/[id]/feedback">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  const limit = await rateLimit(`tutor-feedback:${user.id}`, 120, 60 * 60_000);
  if (!limit.ok) return new NextResponse(null, { status: 204 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("tutor_messages")
    .select("role, grounding, provider, conversation:tutor_conversations!tutor_messages_conversation_fk(mode)")
    .eq("id", params.data.id)
    .maybeSingle();
  if (!data || data.role !== "assistant") return NextResponse.json({ error: "Answer not found." }, { status: 404 });
  const mode = (data.conversation as unknown as { mode: string } | null)?.mode ?? "tutor";
  track(user.id, "tamari_feedback", { helpful: body.data.helpful, mode, grounding: data.grounding ?? "conversation", provider: data.provider ?? "none" });
  return new NextResponse(null, { status: 204 });
}
