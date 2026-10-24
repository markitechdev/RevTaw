import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  reads: 0,
  answer: { data: [] as unknown[], error: null as { message: string } | null } as { data: unknown[] | null; error: { message: string } | null },
  admin: true,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    db.admin
      ? { from: () => ({ select: () => ({ abortSignal: async () => (db.reads++, db.answer) }) }) }
      : null,
}));
vi.mock("@/lib/server/cron-auth", () => ({ cronSecret: () => "test-cron-secret-0123456789abcdef" }));
vi.mock("@/lib/reminders/service", () => ({ schedulerConfigured: () => true }));
vi.mock("@/lib/notifications/email-config", () => ({ isEmailConfigured: () => false }));
vi.mock("@/lib/ai/embeddings", () => ({ embeddingsConfigured: () => false }));
vi.mock("@/lib/calendar/google", () => ({ calendarConfigured: () => false }));

const { GET, HEAD } = await import("./route");

const NOW = Date.parse("2026-10-24T12:00:00Z");
const ran = (job: string, minutesAgo: number) => {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return { job, last_finished_at: at, last_ok_at: at, last_error: null };
};
const health = (query = "") => GET(new Request(`http://localhost/api/health${query}`));

let clock = NOW;
describe("the health check", () => {
  beforeEach(() => {
    // Each test starts past the previous answer's 15 seconds, so it reads the database afresh.
    clock += 60_000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(clock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.reads = 0;
    db.admin = true;
    db.answer = { data: [ran("reminders", 1), ran("engine", 60), ran("archive", 60)], error: null };
  });
  afterEach(() => vi.useRealTimers());

  it("answers ok while the database answers and the jobs are on time", async () => {
    const response = await health("?jobs=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      status: "ok",
      database: "ok",
      jobs: { reminders: "ok", digest: "off", embeddings: "off", calendar: "off", engine: "ok", archive: "ok" },
    });
  });

  it("answers 503 when the database does not answer, without the error's text", async () => {
    db.answer = { data: null, error: { message: "connection refused to 10.0.0.5" } };
    const response = await health();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ status: "down", database: "down", jobs: null });
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
  });

  it("fails the jobs check, and only that one, when a job is late", async () => {
    db.answer = { data: [ran("reminders", 40), ran("engine", 60), ran("archive", 60)], error: null };
    const plain = await health();
    expect(plain.status).toBe(200);
    expect(await plain.json()).toMatchObject({ status: "degraded", jobs: { reminders: "late" } });
    const jobs = await health("?jobs=1");
    expect(jobs.status).toBe(503);
  });

  it("reuses an answer for 15 seconds", async () => {
    await health();
    await health("?jobs=1");
    await HEAD(new Request("http://localhost/api/health"));
    expect(db.reads).toBe(1);
    vi.setSystemTime(clock + 16_000);
    await health();
    expect(db.reads).toBe(2);
  });

  it("answers a HEAD request with the same status and no body", async () => {
    db.answer = { data: null, error: { message: "down" } };
    const response = await HEAD(new Request("http://localhost/api/health"));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  });

  it("cannot vouch for the jobs without the secret key", async () => {
    db.admin = false;
    const plain = await health();
    expect(plain.status).toBe(200);
    expect(await plain.json()).toMatchObject({ status: "ok", database: "unchecked", jobs: null });
    expect((await health("?jobs=1")).status).toBe(503);
  });
});
