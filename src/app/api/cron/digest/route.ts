import { NextResponse } from "next/server";

import { runDailyDigest } from "@/lib/notifications/digest";
import { isEmailConfigured } from "@/lib/notifications/email-config";
import { cronSecret, hasCronSecret } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The daily study digest: call it every 15–60 minutes with
 * `Authorization: Bearer <CRON_SECRET>` (supabase/schedules.sql sets this up
 * with pg_cron). Each student who turned the digest on gets it once, between
 * 6 and 11 a.m. in their time zone.
 */
async function run(request: Request) {
  if (!cronSecret()) {
    return NextResponse.json({ error: "CRON_SECRET (16+ characters) is not set on this server." }, { status: 503 });
  }
  if (!hasCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "Email is not set up (RESEND_API_KEY and EMAIL_FROM)." }, { status: 503 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  try {
    return NextResponse.json(await runDailyDigest(admin), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("digest: run failed", error);
    return NextResponse.json({ error: "The digest run failed." }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
