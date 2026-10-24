import { NextResponse } from "next/server";
import { z } from "zod";

import { track } from "@/lib/analytics/server";
import { ServiceError } from "@/lib/errors";
import { getClientAddress, rateLimit } from "@/lib/rate-limit";
import { REVIEWER_KIND_IDS } from "@/lib/reviewers/kinds";
import { createReviewer } from "@/lib/reviewers/service";
import { getCurrentUser } from "@/lib/supabase/server";

export const maxDuration = 120;
export const runtime = "nodejs";

const bodySchema = z.object({
  materialId: z.uuid(),
  kind: z.enum(REVIEWER_KIND_IDS),
});

/** Generates a new reviewer from a processed material. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Choose a material and a reviewer type." }, { status: 400 });
  }

  const ip = await getClientAddress();
  const limit = await rateLimit(`generate:${user.id}:${ip}`, 30, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You have generated a lot recently. Please wait a little before creating more." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const result = await createReviewer(body.data.materialId, body.data.kind);
    track(user.id, "reviewer_created", { format: body.data.kind });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("reviewers: create route failed", error);
    return NextResponse.json({ error: "The reviewer could not be created. Please try again." }, { status: 500 });
  }
}
