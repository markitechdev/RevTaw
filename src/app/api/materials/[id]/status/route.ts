import { NextResponse } from "next/server";
import { z } from "zod";

import { settleMaterialStatus } from "@/lib/generation/stale";
import { rateLimit } from "@/lib/rate-limit";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const paramsSchema = z.object({ id: z.uuid() });

/** Lightweight status poll used while a material is being processed. */
export async function GET(_request: Request, context: RouteContext<"/api/materials/[id]/status">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  // The page polls every few seconds; anything far beyond that is not a browser.
  const limit = rateLimit(`material-status:${user.id}`, 120, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many status checks. Try again in a minute." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  }

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid material id." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .select("status, status_detail, created_at, updated_at, last_processed_at")
    .eq("id", params.data.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not read the status." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Material not found." }, { status: 404 });
  }

  // A step cut off by a timeout or a closed tab reads as failed, so the page stops waiting and offers Retry.
  const settled = settleMaterialStatus(data);
  return NextResponse.json(
    { status: settled.status, detail: settled.status_detail, updatedAt: data.updated_at },
    { headers: { "cache-control": "no-store" } },
  );
}
