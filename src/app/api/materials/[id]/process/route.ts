import { NextResponse } from "next/server";
import { z } from "zod";

import { MaterialNotFoundError, processMaterial } from "@/lib/materials/pipeline";
import { getClientAddress, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

// Extraction and analysis can take a while for large documents.
export const maxDuration = 120;
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

/**
 * Runs (or re-runs) processing for one of the signed-in student's materials.
 * Called by the browser right after an upload finishes and by the Retry button.
 */
export async function POST(request: Request, context: RouteContext<"/api/materials/[id]/process">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid material id." }, { status: 400 });
  }

  const ip = await getClientAddress();
  const limit = rateLimit(`process:${user.id}:${ip}`, 30, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many processing requests. Please wait a few minutes." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const force = new URL(request.url).searchParams.get("force") === "1";

  try {
    const outcome = await processMaterial(params.data.id, { force });
    return NextResponse.json(outcome, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof MaterialNotFoundError) {
      return NextResponse.json({ error: "Material not found." }, { status: 404 });
    }
    console.error("materials: process route failed", error);
    return NextResponse.json(
      { error: "Processing could not be started. Please try again." },
      { status: 500 },
    );
  }
}
