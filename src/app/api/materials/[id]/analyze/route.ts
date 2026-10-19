import { NextResponse } from "next/server";
import { z } from "zod";

import { MaterialNotFoundError, reanalyzeMaterial } from "@/lib/materials/pipeline";
import { getClientAddress, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

export const maxDuration = 120;
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

/** Re-runs the AI analysis of an already-extracted material. */
export async function POST(_request: Request, context: RouteContext<"/api/materials/[id]/analyze">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid material id." }, { status: 400 });
  }

  const ip = await getClientAddress();
  const limit = rateLimit(`analyze:${user.id}:${ip}`, 20, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many analysis requests. Please wait a few minutes." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const outcome = await reanalyzeMaterial(params.data.id);
    return NextResponse.json(outcome, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof MaterialNotFoundError) {
      return NextResponse.json({ error: "Material not found." }, { status: 404 });
    }
    console.error("materials: analyze route failed", error);
    return NextResponse.json({ error: "Analysis could not be started. Please try again." }, { status: 500 });
  }
}
