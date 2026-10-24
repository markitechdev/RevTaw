import { describe, expect, it } from "vitest";

import { JOB_NAMES, jobStates, recordJobRun, withJobRecord, type JobName } from "@/lib/jobs/runs";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const all = (on: boolean) => Object.fromEntries(JOB_NAMES.map((job) => [job, on])) as Record<JobName, boolean>;

/** Records what the jobs write to job_runs. */
function fakeClient(fail = false) {
  const writes: Array<{ row: Record<string, unknown>; options: unknown }> = [];
  const client = {
    from(table: string) {
      expect(table).toBe("job_runs");
      return { upsert: async (row: Record<string, unknown>, options: unknown) => (writes.push({ row, options }), { error: fail ? { message: "down" } : null }) };
    },
  };
  return { client: client as never, writes };
}

describe("job states", () => {
  it("says which jobs ran on time, ran late, failed or never ran", () => {
    const states = jobStates(
      [
        { job: "reminders", last_finished_at: minutesAgo(1), last_ok_at: minutesAgo(1), last_error: null },
        { job: "digest", last_finished_at: minutesAgo(90), last_ok_at: minutesAgo(90), last_error: null },
        { job: "embeddings", last_finished_at: minutesAgo(5), last_ok_at: minutesAgo(15), last_error: "Cloudflare answered 500" },
        { job: "engine", last_finished_at: minutesAgo(20 * 60), last_ok_at: minutesAgo(20 * 60), last_error: null },
      ],
      { ...all(true), calendar: false },
      NOW,
    );
    expect(states).toEqual({ reminders: "ok", digest: "late", embeddings: "failing", calendar: "off", engine: "ok", archive: "never" });
  });

  it("counts a job as ok again once a run after a failure succeeds", () => {
    const states = jobStates([{ job: "reminders", last_finished_at: minutesAgo(1), last_ok_at: minutesAgo(1), last_error: null }], all(true), NOW);
    expect(states.reminders).toBe("ok");
  });

  it("reports nothing as behind on a server without the scheduler", () => {
    expect(Object.values(jobStates([], all(false), NOW))).toEqual(JOB_NAMES.map(() => "off"));
  });
});

describe("recording a run", () => {
  it("stores a good run with its time and clears the last error", async () => {
    const { client, writes } = fakeClient();
    expect(await withJobRecord(client, "digest", async () => ({ sent: 3 }))).toEqual({ sent: 3 });
    expect(writes).toHaveLength(1);
    expect(writes[0].options).toEqual({ onConflict: "job" });
    expect(writes[0].row).toMatchObject({ job: "digest", last_error: null });
    expect(writes[0].row.last_ok_at).toBe(writes[0].row.last_finished_at);
  });

  it("stores a failed run without touching the last good one, and rethrows", async () => {
    const { client, writes } = fakeClient();
    await expect(withJobRecord(client, "engine", async () => Promise.reject(new Error("timeout")))).rejects.toThrow("timeout");
    expect(writes[0].row).toMatchObject({ job: "engine", last_error: "timeout" });
    expect(writes[0].row).not.toHaveProperty("last_ok_at");
  });

  it("never fails the job when the record cannot be written", async () => {
    const { client } = fakeClient(true);
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args);
    try {
      await expect(recordJobRun(client, "archive")).resolves.toBeUndefined();
    } finally {
      console.error = original;
    }
    expect(errors).toHaveLength(1);
  });
});
