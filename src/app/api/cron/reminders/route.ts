import { NextResponse } from "next/server";

import { withJobRecord } from "@/lib/jobs/runs";
import { processDueReminders, schedulerConfigured } from "@/lib/reminders/service";
import { cronSecret, hasCronSecret } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The reminder scheduler (UI phase §28): call every few minutes with
 * `Authorization: Bearer <CRON_SECRET>` — Vercel Cron does this by itself
 * when CRON_SECRET is set; any other scheduler (GitHub Actions, cron-job.org,
 * Supabase pg_cron + pg_net) can send the same header. It delivers due
 * reminders in-app and by email.
 */
async function run(request: Request) {
  if (!cronSecret() || !schedulerConfigured()) {
    return NextResponse.json({ error: "The reminder scheduler is not set up on this server (CRON_SECRET of 16+ characters and SUPABASE_SECRET_KEY)." }, { status: 503 });
  }
  if (!hasCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  try {
    const result = await withJobRecord(admin, "reminders", () => processDueReminders(admin));
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("reminders: scheduler run failed", error);
    return NextResponse.json({ error: "The reminder run failed." }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
