import { NextResponse } from "next/server";

import { withJobRecord } from "@/lib/jobs/runs";
import { embeddingsConfigured } from "@/lib/ai/embeddings";
import { embedMissingChunks } from "@/lib/search/hybrid";
import { cronSecret, hasCronSecret } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Backfill for Tamari's search: embeds material chunks that have no
 * embedding yet (materials processed before migration 0017, or while
 * Cloudflare was unreachable), in batches, for about 45 seconds per call.
 * Call it with `Authorization: Bearer <CRON_SECRET>` until `remaining` is
 * false — by hand once after upgrading, or every few minutes from a
 * scheduler (see supabase/schedules.sql).
 */
async function run(request: Request) {
  if (!cronSecret()) {
    return NextResponse.json({ error: "CRON_SECRET (16+ characters) is not set on this server." }, { status: 503 });
  }
  if (!hasCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!embeddingsConfigured()) {
    return NextResponse.json({ error: "Embeddings need CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN." }, { status: 503 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });

  try {
    const outcome = await withJobRecord(admin, "embeddings", () => embedMissingChunks(admin, { budgetMs: 45_000, maxChunks: 600 }));
    return NextResponse.json(outcome, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("embeddings: backfill run failed", error);
    return NextResponse.json({ error: "The embedding run failed." }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
