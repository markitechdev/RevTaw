import { beforeEach, describe, expect, it, vi } from "vitest";

import { digestContent, digestIsEmpty, digestLead, digestMessage, runDailyDigest, type DigestContent } from "@/lib/notifications/digest";

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
    expect(message.text).toContain("Stop the daily digest: https://revtaw.example/api/email/unsubscribe?u=1&k=digest&t=x");
  });

  it("leads with an exam within three days, then lists the rest", () => {
    const message = digestMessage("Ana", content, "https://revtaw.example", null);
    expect(message.text).toContain("Your Bio midterm is in 3 days");
    expect(message.text).toContain("Exam date: Sunday, October 25");
    expect(message.text).toContain("Start Smart Study: https://revtaw.example/study?method=smart_study");
    expect(message.text).toContain("Flashcards\n- 12 cards are due today\nStart reviewing: https://revtaw.example/flashcards/review");
    expect(message.text).toContain("Today's plan\n- 2:30 PM · Biology <reviewer> (25 min)\n- Read chapter 3 (20 min)\nView planner: https://revtaw.example/planner?date=2026-10-22");
    expect(message.html).toContain('src="https://revtaw.example/email/icon-calendar-clock.png"');
  });

  it("shows the leading exam's subject, plan progress and weak topics", () => {
    const exam = { ...content.exams[0], subject: "Biology", progress: { done: 4, total: 10 }, weakTopics: ["Glycolysis", "ATP yield"] };
    const message = digestMessage("Ana", { ...content, exams: [exam] }, "https://revtaw.example", null);
    expect(message.text).toContain("Subject: Biology\nStudy progress: 4 of 10 planned activities done\nWeak topics: Glycolysis, ATP yield");
  });

  it("leads with reviews, else today's plan, when no exam is close", () => {
    const later = { ...content, exams: [{ title: "Bio final", date: "2026-11-01", daysLeft: 10 }] };
    expect(digestLead(later)).toBe("reviews");
    const reviews = digestMessage("Ana", later, "https://revtaw.example", null);
    expect(reviews.text).toContain("You have 12 reviews due today");
    expect(reviews.text).toContain("Start Reviewing: https://revtaw.example/flashcards/review");
    expect(reviews.text).toContain("Exams coming up\n- Bio final: in 10 days (Sun, Nov 1)");

    const plan = { ...later, dueReviews: 0 };
    expect(digestLead(plan)).toBe("plan");
    const planned = digestMessage("Ana", plan, "https://revtaw.example", null);
    expect(planned.text).toContain("You have 2 activities planned today");
    expect(planned.text).toContain("2:30 PM: Biology <reviewer> · 25 min\nAny time: Read chapter 3 · 20 min");
    expect(planned.text).toContain("View Planner: https://revtaw.example/planner?date=2026-10-22");

    expect(digestLead({ ...plan, tasks: [] })).toBe("exam");
  });

  it("is skipped on a day with nothing to study", () => {
    expect(digestIsEmpty({ day: "2026-10-22", dueReviews: 0, tasks: [], exams: [] })).toBe(true);
    expect(digestIsEmpty(content)).toBe(false);
  });

  it("says today and tomorrow for close exams", () => {
    const message = digestMessage(null, { day: "2026-10-22", dueReviews: 0, tasks: [], exams: [{ title: "Quiz", date: "2026-10-22", daysLeft: 0 }, { title: "Exam", date: "2026-10-23", daysLeft: 1 }] }, "https://r.example", null);
    expect(message.subject).toBe("Today in RevTaw: Quiz today");
    expect(message.text).toContain("Good morning!");
    expect(message.text).toContain("Your Quiz is today");
    expect(message.text).toContain("- Exam: tomorrow");
    expect(message.text).not.toContain("Stop the daily digest");
  });

  it("goes out without links when the site has no public address", () => {
    const message = digestMessage("Ana", content, null, null);
    expect(message.html).not.toMatch(/href="https?:|localhost|<img/);
    expect(message.text).not.toMatch(/https?:|localhost|Start Smart Study/);
    expect(message.text).toContain("Flashcards\n- 12 cards are due today");
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
      gt: () => builder,
      neq: () => builder,
      in: () => builder,
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

describe("digest content", () => {
  it("reads the subject, plan progress and weak topics of an exam within three days", async () => {
    const { client, calls } = fakeClient((call) => {
      if (call.table === "flashcards") return { count: 3 };
      if (call.table === "exams") return { data: [{ id: "e1", title: "Bio midterm", exam_date: "2026-10-25", subject: { name: "Biology" } }, { id: "e2", title: "Math", exam_date: "2026-11-02", subject: null }] };
      if (call.table === "study_tasks" && call.filters.exam_id === "e1") return { data: [{ status: "done" }, { status: "pending" }, { status: "done" }] };
      if (call.table === "study_tasks") return { data: [] };
      if (call.table === "exam_materials") return { data: [{ material_id: "m1" }] };
      if (call.table === "concept_mastery")
        return {
          data: [
            // One wrong answer so far: still being measured, not a weak topic.
            { mastery: 12, attempts: 1, first_attempts: 1, status: "learning", weakness: 0.15, misconceptions: 0, concept: { name: "Krebs cycle" } },
            { mastery: 20, attempts: 5, first_attempts: 5, status: "weak", weakness: 0.4, misconceptions: 0, concept: { name: "Glycolysis" } },
            { mastery: 35, attempts: 4, first_attempts: 4, status: "learning", weakness: 0.2, misconceptions: 1, concept: { name: "ATP yield" } },
          ],
        };
      return {};
    });
    const content = await digestContent(client, "ana", "2026-10-22", "Asia/Manila");
    expect(content.exams[0]).toEqual({ title: "Bio midterm", date: "2026-10-25", daysLeft: 3, subject: "Biology", progress: { done: 2, total: 3 }, weakTopics: ["Glycolysis", "ATP yield"] });
    expect(content.exams[1]).toEqual({ title: "Math", date: "2026-11-02", daysLeft: 11, subject: null });
    expect(calls.filter((call) => call.table === "concept_mastery")).toHaveLength(1);
  });

  it("doesn't read exam details when no exam is close", async () => {
    const { client, calls } = fakeClient((call) => (call.table === "exams" ? { data: [{ id: "e2", title: "Math", exam_date: "2026-11-02", subject: null }] } : call.table === "flashcards" ? { count: 0 } : { data: [] }));
    await digestContent(client, "ana", "2026-10-22", "Asia/Manila");
    expect(calls.some((call) => call.table === "exam_materials" || call.table === "concept_mastery")).toBe(false);
  });
});

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
