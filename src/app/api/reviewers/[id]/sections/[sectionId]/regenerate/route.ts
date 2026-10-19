import { NextResponse } from "next/server";
import { z } from "zod";

import { isAiError } from "@/lib/ai";
import { getClientAddress, rateLimit } from "@/lib/rate-limit";
import { regenerateReviewerSection, ServiceError } from "@/lib/reviewers/service";
import { getCurrentUser } from "@/lib/supabase/server";

export const maxDuration = 90;
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid(), sectionId: z.uuid() });
const bodySchema = z.object({
  instructions: z.string().trim().max(500).optional().transform((value) => value || null),
});

/** Rewrites one section of a reviewer, optionally following the student's instructions. */
export async function POST(request: Request, context: RouteContext<"/api/reviewers/[id]/sections/[sectionId]/regenerate">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid section." }, { status: 400 });
  }
  const body = bodySchema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!body.success) {
    return NextResponse.json({ error: "Instructions are limited to 500 characters." }, { status: 400 });
  }
  const ip = await getClientAddress();
  const limit = rateLimit(`regenerate:${user.id}:${ip}`, 60, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many regeneration requests. Please wait a little." }, { status: 429 });
  }
  try {
    const section = await regenerateReviewerSection(params.data.id, params.data.sectionId, body.data.instructions);
    return NextResponse.json(section, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (isAiError(error)) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("reviewers: regenerate section failed", error);
    return NextResponse.json({ error: "The section could not be regenerated. Please try again." }, { status: 500 });
  }
}
