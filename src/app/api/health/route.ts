import { NextResponse } from "next/server";

import { embeddingsConfigured } from "@/lib/ai/embeddings";
import { calendarConfigured } from "@/lib/calendar/google";
import { JOB_NAMES, jobStates, type JobName, type JobState } from "@/lib/jobs/runs";
import { isEmailConfigured } from "@/lib/notifications/email-config";
import { schedulerConfigured } from "@/lib/reminders/service";
import { cronSecret } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The health check for uptime monitors. `GET /api/health` answers 200 while RevTaw and its database
 * respond, and 503 when the database does not answer within 5 seconds. With `?jobs=1` it also answers 503
 * when a scheduled job set up on this server is late, failing or has never run, so a second monitor can
 * watch the scheduler. It says only "ok", "late" and the like, never an error's text. An answer is reused
 * for 15 seconds, so a flood of checks costs the database nothing.
 */

const CACHE_MS = 15_000;
const DATABASE_TIMEOUT_MS = 5_000;

type Database = "ok" | "down" | "unchecked";
type Check = { at: number; database: Database; jobs: Record<JobName, JobState> | null };

let cached: Check | null = null;

/** Which jobs this server runs: the scheduler needs CRON_SECRET, and some jobs need their own service. */
function enabledJobs(): Record<JobName, boolean> {
  const scheduler = Boolean(cronSecret());
  return {
    reminders: scheduler && schedulerConfigured(),
    digest: scheduler && isEmailConfigured(),
    embeddings: scheduler && embeddingsConfigured(),
    calendar: scheduler && calendarConfigured(),
    engine: scheduler,
    archive: scheduler,
  };
}

async function check(now: number): Promise<Check> {
  if (cached && now - cached.at < CACHE_MS) return cached;
  const admin = createAdminClient();
  let database: Database = "unchecked";
  let jobs: Check["jobs"] = null;
  if (admin) {
    try {
      const { data, error } = await admin.from("job_runs").select("job, last_finished_at, last_ok_at, last_error").abortSignal(AbortSignal.timeout(DATABASE_TIMEOUT_MS));
      if (error) {
        database = "down";
        console.error("health: database check failed", error.message);
      } else {
        database = "ok";
        jobs = jobStates(data ?? [], enabledJobs(), now);
      }
    } catch (error) {
      database = "down";
      console.error("health: database check failed", error);
    }
  }
  cached = { at: now, database, jobs };
  return cached;
}

export async function GET(request: Request) {
  const watchJobs = new URL(request.url).searchParams.get("jobs") === "1";
  const result = await check(Date.now());
  const behind = result.jobs ? JOB_NAMES.filter((job) => ["late", "failing", "never"].includes(result.jobs![job])) : [];
  const status = result.database === "down" ? "down" : behind.length > 0 ? "degraded" : "ok";
  // The jobs monitor also fails when the jobs cannot be read at all (no secret key on this server).
  const unhealthy = result.database === "down" || (watchJobs && (result.jobs === null || behind.length > 0));
  return NextResponse.json(
    { status, database: result.database, jobs: result.jobs, checkedAt: new Date(result.at).toISOString() },
    { status: unhealthy ? 503 : 200, headers: { "cache-control": "no-store" } },
  );
}

export async function HEAD(request: Request) {
  const response = await GET(request);
  return new NextResponse(null, { status: response.status, headers: { "cache-control": "no-store" } });
}
