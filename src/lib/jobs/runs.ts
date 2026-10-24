import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * The scheduled jobs (supabase/schedules.sql) record each run in job_runs, so the health check can tell
 * when the scheduler has stopped calling or a job keeps failing (migration 0033).
 */

export const JOB_NAMES = ["reminders", "digest", "embeddings", "calendar", "engine", "archive"] as const;
export type JobName = (typeof JOB_NAMES)[number];

/**
 * How long after its last good run a job counts as late: its schedule (schedules.sql) with room for a
 * missed call or two. Reminders run every minute, the digest every 15 minutes, embeddings every 10,
 * the calendar hourly, the engine and the archive nightly.
 */
export const LATE_AFTER_MINUTES: Record<JobName, number> = {
  reminders: 15,
  digest: 60,
  embeddings: 60,
  calendar: 3 * 60,
  engine: 26 * 60,
  archive: 26 * 60,
};

export type JobState = "ok" | "late" | "failing" | "never" | "off";
export type JobRun = { job: string; last_finished_at: string | null; last_ok_at: string | null; last_error: string | null };

type Client = SupabaseClient<Database>;

/** Stores how a run ended; a failure to store it is logged and never fails the job itself. */
export async function recordJobRun(client: Client, job: JobName, failure: unknown = null): Promise<void> {
  const now = new Date().toISOString();
  // A failed run leaves last_ok_at as it was: the upsert only writes the columns it is given.
  const row: Database["public"]["Tables"]["job_runs"]["Insert"] =
    failure === null
      ? { job, last_finished_at: now, last_ok_at: now, last_error: null }
      : { job, last_finished_at: now, last_error: (failure instanceof Error ? failure.message : String(failure)).slice(0, 500) || "Failed." };
  const { error } = await client.from("job_runs").upsert(row, { onConflict: "job" });
  if (error) console.error(`jobs: could not record the ${job} run`, error.message);
}

/** Runs one job's work and records how it ended (the error is rethrown for the route to answer). */
export async function withJobRecord<T>(client: Client, job: JobName, work: () => Promise<T>): Promise<T> {
  let result: T;
  try {
    result = await work();
  } catch (error) {
    await recordJobRun(client, job, error);
    throw error;
  }
  await recordJobRun(client, job);
  return result;
}

/**
 * Each job's state at `now`: off (not set up on this server), never (no run recorded), failing (its last
 * run ended in an error), late (no good run within its window) or ok.
 */
export function jobStates(rows: JobRun[], enabled: Record<JobName, boolean>, now: number): Record<JobName, JobState> {
  const byJob = new Map(rows.map((row) => [row.job, row]));
  const states = {} as Record<JobName, JobState>;
  for (const job of JOB_NAMES) {
    const row = byJob.get(job);
    if (!enabled[job]) states[job] = "off";
    else if (!row || !row.last_finished_at) states[job] = "never";
    else if (row.last_error && (!row.last_ok_at || Date.parse(row.last_ok_at) < Date.parse(row.last_finished_at))) states[job] = "failing";
    else if (!row.last_ok_at || now - Date.parse(row.last_ok_at) > LATE_AFTER_MINUTES[job] * 60_000) states[job] = "late";
    else states[job] = "ok";
  }
  return states;
}
