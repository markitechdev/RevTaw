import { NextResponse } from "next/server";
import { z } from "zod";

import { retryQuiz, ServiceError } from "@/lib/quizzes/service";
import { getClientAddress, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

export const maxDuration = 120;
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

/** Re-runs generation for a failed quiz. */
export async function POST(_request: Request, context: RouteContext<"/api/quizzes/[id]/retry">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid quiz id." }, { status: 400 });
  }
  const ip = await getClientAddress();
  const limit = await rateLimit(`generate:${user.id}:${ip}`, 30, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many generation requests. Please wait a little." }, { status: 429 });
  }
  try {
    const result = await retryQuiz(params.data.id);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("quizzes: retry route failed", error);
    return NextResponse.json({ error: "The quiz could not be regenerated. Please try again." }, { status: 500 });
  }
}
