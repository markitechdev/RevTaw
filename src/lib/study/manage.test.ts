import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase } from "@/test/fake-supabase";

const deps = vi.hoisted(() => ({
  db: { client: null as never },
  completeItemSession: vi.fn(async () => ({})),
  completeSession: vi.fn(async () => ({})),
  completeSmartSession: vi.fn(async () => ({})),
  completePreTesting: vi.fn(async () => ({})),
  completeTutorSession: vi.fn(async () => ({})),
  syncPracticeTesting: vi.fn(async (): Promise<object | null> => null),
  sessionReviewCounts: vi.fn(async () => ({ reviewed: 8, again: 2 })),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => deps.db.client }));
vi.mock("@/lib/study/service", () => ({ completeItemSession: deps.completeItemSession, syncPracticeTesting: deps.syncPracticeTesting }));
vi.mock("@/lib/adaptive/smart", () => ({ completeSmartSession: deps.completeSmartSession }));
vi.mock("@/lib/study/flows/pretest", () => ({ completePreTesting: deps.completePreTesting }));
vi.mock("@/lib/tutor/service", () => ({ completeTutorSession: deps.completeTutorSession }));
vi.mock("@/lib/flashcards/service", () => ({ sessionReviewCounts: deps.sessionReviewCounts }));
vi.mock("@/lib/study/sessions", async (original) => ({ ...(await original<typeof import("@/lib/study/sessions")>()), completeSession: deps.completeSession }));
vi.mock("@/lib/gamification/service", () => ({ awardSessionXp: vi.fn() }));
vi.mock("@/lib/planner/service", () => ({ completeTaskForSession: vi.fn() }));

const { deleteSession, endSession, renameSession } = await import("@/lib/study/manage");

type Row = Record<string, unknown>;

function session(overrides: Row = {}): Row {
  return {
    id: "s1",
    user_id: "u1",
    status: "in_progress",
    method: "active_recall",
    title: "Biology 2 — Active Recall",
    material_id: "m1",
    started_at: "2026-10-24T08:00:00Z",
    last_active_at: "2026-10-24T08:25:00Z",
    focus_seconds: 0,
    quiz_attempt_id: null,
    state: {},
    ...overrides,
  };
}

function use(tables: Record<string, Row[]>) {
  const db = fakeSupabase(tables);
  deps.db.client = db.client;
  return db;
}

beforeEach(() => {
  for (const mock of [deps.completeItemSession, deps.completeSession, deps.completeSmartSession, deps.completePreTesting, deps.completeTutorSession, deps.syncPracticeTesting, deps.sessionReviewCounts]) mock.mockClear();
  deps.syncPracticeTesting.mockResolvedValue(null);
});

describe("renaming a session", () => {
  it("renames only the student's own session and says what it is called now", async () => {
    const db = use({ study_sessions: [session(), session({ id: "s2", user_id: "u2" })] });
    await expect(renameSession("u1", "s1", "Cell respiration, round two")).resolves.toEqual({ id: "s1", title: "Cell respiration, round two" });
    expect(db.log[0].filters).toEqual([
      { op: "eq", column: "id", value: "s1" },
      { op: "eq", column: "user_id", value: "u1" },
    ]);
    await expect(renameSession("u1", "s2", "Not mine")).rejects.toMatchObject({ status: 404 });
    expect(db.tables.study_sessions[1].title).toBe("Biology 2 — Active Recall");
  });
});

describe("ending a session", () => {
  it("closes an item session as stopped early with the time it was active", async () => {
    use({ study_sessions: [session()] });
    await expect(endSession("u1", "s1")).resolves.toEqual({ id: "s1" });
    expect(deps.completeItemSession).toHaveBeenCalledWith("s1", 25 * 60, true);
  });

  it("counts at most three hours for a session left open for days", async () => {
    use({ study_sessions: [session({ last_active_at: "2026-10-27T08:00:00Z" })] });
    await endSession("u1", "s1");
    expect(deps.completeItemSession).toHaveBeenCalledWith("s1", 3 * 3600, true);
  });

  it("ends a plan's unfinished blocks first, then the plan", async () => {
    const plan = session({ id: "plan", method: "smart_study" });
    const block = session({ id: "block", method: "feynman", state: { parentId: "plan" } });
    const done = session({ id: "done", method: "active_recall", status: "completed", state: { parentId: "plan" } });
    use({ study_sessions: [plan, block, done] });
    await endSession("u1", "plan");
    expect(deps.completeItemSession).toHaveBeenCalledWith("block", 25 * 60, true);
    expect(deps.completeItemSession).toHaveBeenCalledTimes(1);
    expect(deps.completeSmartSession).toHaveBeenCalledWith("plan", { stopped: true });
    expect(deps.completeItemSession.mock.invocationCallOrder[0]).toBeLessThan(deps.completeSmartSession.mock.invocationCallOrder[0]);
  });

  it("closes a pre-test plan, a tutor session and a review their own way", async () => {
    use({ study_sessions: [session({ id: "pre", method: "pre_testing" }), session({ id: "chat", method: "socratic_questioning" }), session({ id: "cards", method: "flashcards" })] });
    await endSession("u1", "pre");
    expect(deps.completePreTesting).toHaveBeenCalledWith("pre", { stopped: true });
    await endSession("u1", "chat");
    expect(deps.completeTutorSession).toHaveBeenCalledWith("chat", { stopped: true });
    await endSession("u1", "cards");
    expect(deps.completeSession).toHaveBeenCalledWith(expect.anything(), "cards", expect.objectContaining({ questionsAnswered: 8, correct: 6, incorrect: 2, abandoned: true }));
  });

  it("keeps a timer's saved focus time and rounds", async () => {
    use({ study_sessions: [session({ method: "pomodoro", focus_seconds: 1500, state: { topic: "Biology 2", completedRounds: 1 } })] });
    await endSession("u1", "s1");
    expect(deps.completeSession).toHaveBeenCalledWith(expect.anything(), "s1", expect.objectContaining({ focusSeconds: 1500, topics: ["Biology 2"], extra: { completedRounds: 1 }, abandoned: true }));
  });

  it("closes a submitted practice test with its score, and an unsubmitted one with the attempt's time", async () => {
    use({
      study_sessions: [session({ method: "practice_testing", quiz_attempt_id: "a1" })],
      quiz_attempts: [{ id: "a1", started_at: "2026-10-24T08:00:00Z", updated_at: "2026-10-24T08:12:00Z", time_limit_seconds: null }],
    });
    deps.syncPracticeTesting.mockResolvedValueOnce({ accuracy: 0.8 });
    await endSession("u1", "s1");
    expect(deps.completeSession).not.toHaveBeenCalled();
    await endSession("u1", "s1");
    expect(deps.completeSession).toHaveBeenCalledWith(expect.anything(), "s1", expect.objectContaining({ focusSeconds: 12 * 60, questionsAnswered: 0, abandoned: true }));
  });

  it("changes nothing for a session that has already ended, and refuses one that is not the student's", async () => {
    use({ study_sessions: [session({ status: "abandoned" }), session({ id: "s2", user_id: "u2" })] });
    await expect(endSession("u1", "s1")).resolves.toEqual({ id: "s1" });
    await expect(endSession("u1", "s2")).rejects.toMatchObject({ status: 404 });
    expect(deps.completeItemSession).not.toHaveBeenCalled();
  });
});

describe("deleting a session", () => {
  it("deletes it with its answers and gives back the concepts they were about", async () => {
    const db = use({
      study_sessions: [session(), session({ id: "keep" })],
      study_session_items: [
        { id: "i1", session_id: "s1", concept_id: "c1", answered_at: "2026-10-24T08:05:00Z" },
        { id: "i2", session_id: "s1", concept_id: "c1", answered_at: "2026-10-24T08:06:00Z" },
        { id: "i3", session_id: "s1", concept_id: "c2", answered_at: null },
        { id: "i4", session_id: "keep", concept_id: "c3", answered_at: "2026-10-24T08:06:00Z" },
      ],
    });
    await expect(deleteSession("u1", "s1")).resolves.toEqual({ id: "s1", conceptIds: ["c1"] });
    expect(db.tables.study_sessions.map((row) => row.id)).toEqual(["keep"]);
    const remove = db.log.find((query) => query.action === "delete");
    expect(remove?.filters).toEqual(expect.arrayContaining([{ op: "eq", column: "user_id", value: "u1" }, { op: "eq", column: "status", value: "in_progress" }]));
  });

  it("deletes a plan's unfinished blocks with it and keeps the finished ones", async () => {
    const db = use({
      study_sessions: [session({ id: "plan", method: "custom_routine" }), session({ id: "open", state: { parentId: "plan" } }), session({ id: "done", status: "completed", state: { parentId: "plan" } })],
      study_session_items: [],
    });
    await deleteSession("u1", "plan");
    expect(db.tables.study_sessions.map((row) => row.id)).toEqual(["done"]);
  });

  it("keeps a finished session, and treats one already gone (or not the student's) as deleted", async () => {
    const db = use({ study_sessions: [session({ status: "completed" }), session({ id: "s2", user_id: "u2" })], study_session_items: [] });
    await expect(deleteSession("u1", "s1")).rejects.toMatchObject({ status: 409 });
    await expect(deleteSession("u1", "gone")).resolves.toEqual({ id: "gone", conceptIds: [] });
    await expect(deleteSession("u1", "s2")).resolves.toEqual({ id: "s2", conceptIds: [] });
    expect(db.tables.study_sessions).toHaveLength(2);
  });
});
