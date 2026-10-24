import { beforeEach, describe, expect, it, vi } from "vitest";

import { digestIsEmpty, digestMessage, runDailyDigest, type DigestContent } from "@/lib/notifications/digest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/notifications/email", () => ({ sendEmail }));
vi.mock("@/lib/notifications/email-config", () => ({ isEmailConfigured: () => true }));
vi.mock("@/lib/env", () => ({ getPublicSiteUrl: () => "https://revtaw.example" }));

const content: DigestContent = {
  day: "2026-10-22",
  dueReviews: 12,
  tasks: [
    { title: "Biology <reviewer>", time: "14:30:00", minutes: 25 },
    { title: "Read chapter 3", time: null, minutes: 20 },
  ],
  exams: [{ title: "Bio midterm", date: "2026-10-25", daysLeft: 3 }],
};

describe("daily digest", () => {
  it("summarizes the day in the subject and escapes the student's text", () => {
    const message = digestMessage("Ana Reyes", content, "https://revtaw.example/", "https://revtaw.example/api/email/unsubscribe?u=1&k=digest&t=x");
    expect(message.subject).toBe("Today in RevTaw: 12 cards to review · 2 planned activities · Bio midterm in 3 days");
    expect(message.html).toContain("Good morning, Ana!");
    expect(message.html).toContain("2:30 PM · Biology &lt;reviewer&gt; (25 min)");
    expect(message.html).not.toContain("<reviewer>");
    expect(message.html).toContain('href="https://revtaw.example/planner?date=2026-10-22"');
    expect(message.html).toContain("Stop the daily digest");
    expect(message.text).toContain("- 2:30 PM · Biology <reviewer> (25 min)");
    expect(message.text).toContain("Bio midterm: in 3 days");
    expect(message.text).toContain("Stop the daily digest: https://revtaw.example/api/email/unsubscribe?u=1&k=digest&t=x");
  });

  it("is skipped on a day with nothing to study", () => {
    expect(digestIsEmpty({ day: "2026-10-22", dueReviews: 0, tasks: [], exams: [] })).toBe(true);
    expect(digestIsEmpty(content)).toBe(false);
  });

  it("says today and tomorrow for close exams", () => {
    const message = digestMessage(null, { day: "2026-10-22", dueReviews: 0, tasks: [], exams: [{ title: "Quiz", date: "2026-10-22", daysLeft: 0 }, { title: "Exam", date: "2026-10-23", daysLeft: 1 }] }, "https://r.example", null);
    expect(message.subject).toBe("Today in RevTaw: Quiz today");
    expect(message.text).toContain("Good morning!");
    expect(message.text).toContain("- Exam: tomorrow");
    expect(message.text).not.toContain("Stop the daily digest");
  });

  it("goes out without links when the site has no public address", () => {
    const message = digestMessage("Ana", content, null, null);
    expect(message.html).not.toMatch(/href=|localhost/);
    expect(message.text).not.toMatch(/https?:|localhost|Open RevTaw/);
    expect(message.text).toContain("Flashcards: 12 cards are due today.");
    expect(message.text).toContain("- Read chapter 3 (20 min)");
  });
});

type Call = { table: string; op: "select" | "upsert" | "update"; filters: Record<string, unknown>; values?: Record<string, unknown> };
type Reply = { data?: unknown; error?: { message: string } | null; count?: number };

/** A Supabase client stand-in: every query is recorded, and `reply` answers it. */
function fakeClient(reply: (call: Call) => Reply) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: {} };
    const builder = {
      select: () => builder,
      upsert: (values: Record<string, unknown>) => Object.assign(call, { op: "upsert", values }) && builder,
      update: (values: Record<string, unknown>) => Object.assign(call, { op: "update", values }) && builder,
      eq: (column: string, value: unknown) => {
        call.filters[column] = value;
        return builder;
      },
      lt: () => builder,
      gte: () => builder,
      lte: () => builder,
      is: () => builder,
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      maybeSingle: () => builder,
      then: (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) => {
        calls.push(call);
        return Promise.resolve({ data: null, error: null, ...reply(call) }).then(resolve, reject);
      },
    };
    return builder;
  };
  const getUserById = async (id: string) => ({ data: { user: { email: `${id}@example.com` } }, error: null });
  return { client: { from, auth: { admin: { getUserById } } } as never, calls };
}

// 8 a.m. in Manila.
const NOW = new Date("2026-10-24T00:00:00Z");
const DAY = "2026-10-24";
const student = (id: string) => ({ id, display_name: id, timezone: "Asia/Manila", preferences: { notifications: { digest: true } } });

/** Two students with the digest on and a due card each; `existing` is a digest row already there for a student. */
function digestWorld(options: { failClaimFor?: string; existing?: Record<string, { status: string; attempts: number; updated_at: string }> } = {}) {
  return fakeClient((call) => {
    if (call.table === "profiles") return { data: [student("ana"), student("ben")] };
    if (call.table === "flashcards") return { count: 2 };
    if (call.table === "study_tasks" || call.table === "exams") return { data: [] };
    const user = (call.filters.user_id ?? call.values?.user_id) as string;
    const existing = options.existing?.[user];
    if (call.op === "upsert") {
      if (user === options.failClaimFor) return { error: { message: "connection reset" } };
      return { data: existing ? [] : [{ user_id: user }] };
    }
    if (call.op === "select") return { data: existing ?? null };
    // An update that takes back an existing row matches only while the row is as it was read.
    if (call.filters.status && existing) {
      const unchanged = call.filters.status === existing.status && call.filters.updated_at === existing.updated_at;
      return { data: unchanged ? [{ user_id: user }] : [] };
    }
    return { data: [{ user_id: user }] };
  });
}

describe("daily digest run", () => {
  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockImplementation(async (message: { to: string }) => ({ ok: true, id: `sent-${message.to}` }));
  });

  it("records one student's failure and goes on to the next", async () => {
    const { client, calls } = digestWorld({ failClaimFor: "ana" });
    const run = await runDailyDigest(client, { now: NOW });
    expect(run).toEqual({ checked: 2, sent: 1, skipped: 0, failed: 1, notDue: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("ben@example.com");
    expect(calls.some((call) => call.op === "update" && call.filters.user_id === "ben" && call.values?.status === "sent")).toBe(true);
  });

  it("takes back a digest a stopped run left sending, once", async () => {
    const stuck = { status: "sending", attempts: 1, updated_at: new Date(Date.now() - 20 * 60_000).toISOString() };
    const { client, calls } = digestWorld({ existing: { ana: stuck } });
    const run = await runDailyDigest(client, { now: NOW });
    expect(run.sent).toBe(2);
    const retake = calls.find((call) => call.op === "update" && call.filters.user_id === "ana" && call.values?.status === "sending");
    expect(retake?.values).toMatchObject({ attempts: 2 });
    expect(retake?.filters).toMatchObject({ day: DAY, status: "sending", updated_at: stuck.updated_at });
  });

  it("leaves a digest another run is sending right now", async () => {
    const sending = { status: "sending", attempts: 1, updated_at: new Date(Date.now() - 60_000).toISOString() };
    const { client } = digestWorld({ existing: { ana: sending } });
    const run = await runDailyDigest(client, { now: NOW });
    expect(run.sent).toBe(1);
    expect(sendEmail.mock.calls.map((call) => call[0].to)).toEqual(["ben@example.com"]);
  });

  it("stops retrying after three attempts", async () => {
    const tired = { status: "sending", attempts: 3, updated_at: new Date(Date.now() - 60 * 60_000).toISOString() };
    const { client } = digestWorld({ existing: { ana: tired, ben: { ...tired, status: "failed" } } });
    const run = await runDailyDigest(client, { now: NOW });
    expect(run.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
