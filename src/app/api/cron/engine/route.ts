import { NextResponse } from "next/server";

import { runNightlyEngine } from "@/lib/adaptive/nightly";
import { cronSecret, hasCronSecret } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The learning engine's nightly run: refits the shared question-difficulty
 * buckets, adds exam boosters and recomputes stale mastery. Call it once a
 * night with `Authorization: Bearer <CRON_SECRET>` (supabase/schedules.sql
 * sets this up with pg_cron); running it more often is harmless.
 */
async function run(request: Request) {
  if (!cronSecret()) {
    return NextResponse.json({ error: "CRON_SECRET (16+ characters) is not set on this server." }, { status: 503 });
  }
  if (!hasCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  try {
    return NextResponse.json(await runNightlyEngine(admin, { budgetMs: 50_000 }), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("engine: nightly run failed", error);
    return NextResponse.json({ error: "The nightly engine run failed." }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
