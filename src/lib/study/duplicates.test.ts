import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase } from "@/test/fake-supabase";

// No secret key: the start lock counts in this process, as in local development.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { checkSessionStart, duplicateLevel, isCopyOf, normalizeForMatch, SESSION_DUPLICATES, signatureForStart, signatureKey, startUnlessDuplicate, withStartLock } = await import("@/lib/study/duplicates");
const { resetRateLimits } = await import("@/lib/rate-limit");

type Row = Record<string, unknown>;

let counter = 0;
/** An unfinished session as the check reads it (the state fields arrive as columns). */
function session(overrides: Row = {}): Row {
  counter += 1;
  return {
    id: `s${counter}`,
    user_id: "u1",
    status: "in_progress",
    title: "Biology 2 — Active Recall",
    method: "active_recall",
    material_id: "m1",
    planned_minutes: 20,
    started_at: `2026-10-2${counter % 10}T08:00:00Z`,
    last_active_at: `2026-10-2${counter % 10}T09:00:00Z`,
    parent_id: null,
    deck_id: null,
    mode: null,
    routine_id: null,
    topic: null,
    task_id: null,
    material: { title: "Biology 2" },
    ...overrides,
  };
}

beforeEach(() => {
  counter = 0;
  resetRateLimits();
});

describe("telling copies of a session apart", () => {
  it("matches the same method on the same material, and nothing else", () => {
    const signature = { method: "active_recall" as const, materialId: "m1" };
    expect(isCopyOf(signature, session() as never)).toBe(true);
    expect(isCopyOf(signature, session({ material_id: "m2" }) as never)).toBe(false);
    expect(isCopyOf(signature, session({ method: "feynman" }) as never)).toBe(false);
    expect(isCopyOf({ method: "error_review", materialId: null }, session({ method: "error_review", material_id: null }) as never)).toBe(true);
  });

  it("never counts a plan's block, which belongs to its plan", () => {
    expect(isCopyOf({ method: "active_recall", materialId: "m1" }, session({ parent_id: "plan-1" }) as never)).toBe(false);
  });

  it("tells reviews apart by deck and mode", () => {
    const review = session({ method: "flashcards", deck_id: "d1", mode: "due" });
    expect(isCopyOf({ method: "flashcards", deckId: "d1", mode: "due" }, review as never)).toBe(true);
    expect(isCopyOf({ method: "flashcards", deckId: "d1", mode: "all" }, review as never)).toBe(false);
    expect(isCopyOf({ method: "flashcards", deckId: "d2", mode: "due" }, review as never)).toBe(false);
    // A review saved without a mode is a review of due cards.
    expect(isCopyOf({ method: "spaced_repetition", mode: "due" }, session({ method: "spaced_repetition", material_id: null, mode: null }) as never)).toBe(true);
  });

  it("tells routines apart, and plans by their length (any material when none was asked for)", () => {
    expect(isCopyOf({ method: "custom_routine", materialId: "m1", routineId: "r1" }, session({ method: "custom_routine", routine_id: "r1" }) as never)).toBe(true);
    expect(isCopyOf({ method: "custom_routine", materialId: "m1", routineId: "r2" }, session({ method: "custom_routine", routine_id: "r1" }) as never)).toBe(false);
    const plan = session({ method: "smart_study", material_id: "m7", planned_minutes: 20 });
    expect(isCopyOf(signatureForStart({ method: "smart_study", materialId: null, plannedMinutes: 20 }), plan as never)).toBe(true);
    expect(isCopyOf(signatureForStart({ method: "smart_study", materialId: null, plannedMinutes: 30 }), plan as never)).toBe(false);
    expect(isCopyOf(signatureForStart({ method: "smart_study", materialId: "m1", plannedMinutes: 20 }), plan as never)).toBe(false);
  });

  it("tells timers apart by the topic typed in, not by the material's own title", () => {
    const timer = session({ method: "pomodoro", topic: "Biology 2" });
    expect(isCopyOf(signatureForStart({ method: "pomodoro", materialId: "m1", plannedMinutes: 25, topic: "" }), timer as never)).toBe(true);
    expect(isCopyOf(signatureForStart({ method: "pomodoro", materialId: "m1", plannedMinutes: 25, topic: "  biology   2 " }), timer as never)).toBe(true);
    expect(isCopyOf(signatureForStart({ method: "pomodoro", materialId: "m1", plannedMinutes: 25, topic: "Chapter 4" }), timer as never)).toBe(false);
    const loose = session({ method: "pomodoro", material_id: null, material: null, topic: "Calculus" });
    expect(isCopyOf(signatureForStart({ method: "pomodoro", materialId: null, plannedMinutes: 25, topic: "calculus" }), loose as never)).toBe(true);
    expect(isCopyOf(signatureForStart({ method: "pomodoro", materialId: null, plannedMinutes: 25, topic: "Physics" }), loose as never)).toBe(false);
  });

  it("compares text without case, extra spaces or look-alike characters", () => {
    expect(normalizeForMatch("  Chapter  4 ")).toBe("chapter 4");
    expect(normalizeForMatch("ＣＨＡＰＴＥＲ")).toBe("chapter");
    expect(signatureKey({ method: "pomodoro", materialId: null, topic: " Calc " })).toBe(signatureKey({ method: "pomodoro", materialId: null, topic: "calc" }));
    expect(signatureKey({ method: "smart_study", minutes: 20 })).not.toBe(signatureKey({ method: "smart_study", materialId: null, minutes: 20 }));
  });

  it("warns once, then plainly, then stops at the limit", () => {
    expect(duplicateLevel(1)).toBe("warning");
    expect(duplicateLevel(SESSION_DUPLICATES.strongWarningAt)).toBe("strong");
    expect(duplicateLevel(SESSION_DUPLICATES.maxUnfinishedCopies - 1)).toBe("strong");
    expect(duplicateLevel(SESSION_DUPLICATES.maxUnfinishedCopies)).toBe("limit");
  });
});

describe("checking before a session starts", () => {
  it("lets a session start when the student has no unfinished copy", async () => {
    const { client, log } = fakeSupabase({ study_sessions: [session({ material_id: "m2" }), session({ status: "completed" }), session({ user_id: "u2" })] });
    expect(await checkSessionStart(client, "u1", { method: "active_recall", materialId: "m1" })).toBeNull();
    // Only the student's own unfinished sessions of that method and material are read.
    expect(log[0].filters).toEqual(
      expect.arrayContaining([
        { op: "eq", column: "user_id", value: "u1" },
        { op: "eq", column: "status", value: "in_progress" },
        { op: "eq", column: "method", value: "active_recall" },
        { op: "eq", column: "material_id", value: "m1" },
      ]),
    );
  });

  it("answers with the copy worked on last, and nothing more than the page needs", async () => {
    const older = session({ id: "old", last_active_at: "2026-10-20T09:00:00Z" });
    const newer = session({ id: "new", title: "Biology 2 — Active Recall", last_active_at: "2026-10-24T09:00:00Z", started_at: "2026-10-24T08:00:00Z" });
    const { client } = fakeSupabase({ study_sessions: [older, newer] });
    const duplicate = await checkSessionStart(client, "u1", { method: "active_recall", materialId: "m1" });
    expect(duplicate).toEqual({
      duplicate: true,
      duplicateCount: 2,
      level: "strong",
      existingItem: { id: "new", title: "Biology 2 — Active Recall", startedAt: "2026-10-24T08:00:00Z", href: "/study/new" },
    });
  });

  it("links an unfinished review to its review page", async () => {
    const { client } = fakeSupabase({ study_sessions: [session({ id: "r1", method: "flashcards", deck_id: "d1", mode: "all" })] });
    const duplicate = await checkSessionStart(client, "u1", { method: "flashcards", deckId: "d1", mode: "all" });
    expect(duplicate?.existingItem.href).toBe("/flashcards/d1/review?mode=all&session=r1");
    expect(duplicate?.level).toBe("warning");
  });

  it("starts another copy when asked, until the limit", async () => {
    const { client } = fakeSupabase({ study_sessions: [session()] });
    expect(await checkSessionStart(client, "u1", { method: "active_recall", materialId: "m1" }, true)).toBeNull();
    const full = fakeSupabase({ study_sessions: Array.from({ length: SESSION_DUPLICATES.maxUnfinishedCopies }, () => session()) });
    const limit = await checkSessionStart(full.client, "u1", { method: "active_recall", materialId: "m1" }, true);
    expect(limit).toMatchObject({ duplicate: true, level: "limit", duplicateCount: SESSION_DUPLICATES.maxUnfinishedCopies });
  });

  it("does not start anything when a copy is found", async () => {
    const { client } = fakeSupabase({ study_sessions: [session()] });
    const start = vi.fn(async () => ({ sessionId: "fresh" }));
    const result = await startUnlessDuplicate(client, "u1", { method: "active_recall", materialId: "m1" }, false, start);
    expect(result).toMatchObject({ duplicate: true });
    expect(start).not.toHaveBeenCalled();
    expect(await startUnlessDuplicate(client, "u1", { method: "active_recall", materialId: "m1" }, true, start)).toEqual({ sessionId: "fresh" });
  });
});

describe("the start lock", () => {
  it("turns a second start away while the first runs, and frees it when the first is done", async () => {
    let finish = () => {};
    const first = withStartLock("u1", "key", () => new Promise<string>((resolve) => (finish = () => resolve("first"))));
    await expect(withStartLock("u1", "key", async () => "second")).rejects.toMatchObject({ status: 409 });
    // Another student, or another kind of session, is not held up.
    await expect(withStartLock("u2", "key", async () => "other student")).resolves.toBe("other student");
    await expect(withStartLock("u1", "other", async () => "other session")).resolves.toBe("other session");
    finish();
    await expect(first).resolves.toBe("first");
    await expect(withStartLock("u1", "key", async () => "again")).resolves.toBe("again");
  });

  it("frees the lock when a start fails, so trying again works", async () => {
    await expect(withStartLock("u1", "key", async () => Promise.reject(new Error("AI down")))).rejects.toThrow("AI down");
    await expect(withStartLock("u1", "key", async () => "retry")).resolves.toBe("retry");
  });

  it("lets only one of two identical starts at the same moment through", async () => {
    const { client } = fakeSupabase({ study_sessions: [] });
    const created: string[] = [];
    const start = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      created.push("session");
      return { sessionId: "new" };
    };
    const results = await Promise.allSettled([
      startUnlessDuplicate(client, "u1", { method: "active_recall", materialId: "m1" }, false, start),
      startUnlessDuplicate(client, "u1", { method: "active_recall", materialId: "m1" }, false, start),
    ]);
    expect(created).toHaveLength(1);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  });
});
