import { NextResponse } from "next/server";
import { z } from "zod";

import { createQuiz, ServiceError } from "@/lib/quizzes/service";
import { quizConfigSchema, typeCoverageError } from "@/lib/quizzes/types";
import { getClientAddress, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

export const maxDuration = 120;
export const runtime = "nodejs";

const bodySchema = quizConfigSchema.extend({ materialId: z.uuid() });

/** Generates a new quiz from a processed material with the chosen settings. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Check the quiz settings." }, { status: 400 });
  }

  const coverage = typeCoverageError(body.data);
  if (coverage) {
    return NextResponse.json({ error: coverage }, { status: 400 });
  }

  const ip = await getClientAddress();
  const limit = rateLimit(`generate:${user.id}:${ip}`, 30, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You have generated a lot recently. Please wait a little before creating more." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const { materialId, ...config } = body.data;
  try {
    const result = await createQuiz(materialId, config);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("quizzes: create route failed", error);
    return NextResponse.json({ error: "The quiz could not be created. Please try again." }, { status: 500 });
  }
}
