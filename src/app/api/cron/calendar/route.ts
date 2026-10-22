import { NextResponse } from "next/server";

import { calendarConfigured } from "@/lib/calendar/google";
import { reconcileAllCalendars } from "@/lib/calendar/sync";
import { cronSecret, hasCronSecret } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly Google Calendar sync for every connected student (changes are also
 * synced right after they happen; this catches anything that was missed).
 * Call with `Authorization: Bearer <CRON_SECRET>`.
 */
async function run(request: Request) {
  if (!cronSecret()) return NextResponse.json({ error: "CRON_SECRET (16+ characters) is not set on this server." }, { status: 503 });
  if (!hasCronSecret(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!calendarConfigured()) return NextResponse.json({ error: "Google Calendar is not set up on this server." }, { status: 503 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  try {
    return NextResponse.json(await reconcileAllCalendars(admin), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("calendar: hourly sync failed", error);
    return NextResponse.json({ error: "The calendar run failed." }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
