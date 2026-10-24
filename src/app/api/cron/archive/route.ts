import { NextResponse } from "next/server";

import { withJobRecord } from "@/lib/jobs/runs";
import { purgeExpiredMaterials } from "@/lib/materials/purge";
import { cronSecret, hasCronSecret } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 50;
const BUDGET_MS = 45_000;

/**
 * The Archive's 30 days: deletes the file, extracted text and analysis of
 * every material archived more than 30 days ago (what was made from it
 * stays). Call it once a day with `Authorization: Bearer <CRON_SECRET>`
 * (supabase/schedules.sql sets this up); students' own visits to Home and
 * Materials do the same for their materials, so it is a backstop.
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

  const started = Date.now();
  try {
    const outcome = await withJobRecord(admin, "archive", async () => {
      let purged = 0;
      let remaining = false;
      while (Date.now() - started < BUDGET_MS) {
        const batch = await purgeExpiredMaterials(admin, { limit: BATCH });
        purged += batch;
        // A short batch means nothing is left; a full one may have more behind it. A batch that
        // finished nothing (storage or database refused) stops the run until the next call.
        remaining = batch === BATCH;
        if (!remaining) break;
      }
      return { purged, remaining };
    });
    return NextResponse.json(outcome, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("archive: purge run failed", error);
    return NextResponse.json({ error: "The archive run failed." }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
