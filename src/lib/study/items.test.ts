import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudySession, StudySessionItem } from "@/lib/supabase/database.types";

const engine = vi.hoisted(() => ({ refreshMastery: vi.fn(async () => {}) }));

vi.mock("@/lib/adaptive/engine", () => engine);
vi.mock("@/lib/concepts/service", () => ({ ensureConcepts: vi.fn() }));
vi.mock("@/lib/reviewers/service", () => ({ loadMaterialContext: vi.fn() }));
vi.mock("@/lib/gamification/service", () => ({ awardSessionXp: vi.fn() }));
vi.mock("@/lib/planner/service", () => ({ completeTaskForSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { recordItemResult, storeItemAttempt } = await import("@/lib/study/items");

type Filter = [op: "eq" | "is", column: string, value: unknown];

/**
 * One study item in memory. An update applies only when every filter matches the row as it is at that
 * moment, as Postgres does for two updates of one row: the second sees the first one's answer.
 */
function fakeClient(row: { id: string; attempts: number; answered_at: string | null }) {
  const updates: Array<{ values: Record<string, unknown>; filters: Filter[] }> = [];
  const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
  const mistakes: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      if (table === "mistakes") {
        return { insert: async (values: Record<string, unknown>) => (mistakes.push(values), { error: null }) };
      }
      expect(table).toBe("study_session_items");
      return {
        update(values: Record<string, unknown>) {
          const call = { values, filters: [] as Filter[] };
          updates.push(call);
          const chain = {
            eq: (column: string, value: unknown) => (call.filters.push(["eq", column, value]), chain),
            is: (column: string, value: unknown) => (call.filters.push(["is", column, value]), chain),
            select: async () => {
              const matches = call.filters.every(([, column, value]) => (row as Record<string, unknown>)[column] === value);
              if (!matches) return { data: [], error: null };
              Object.assign(row, values);
              return { data: [{ id: row.id }], error: null };
            },
          };
          return chain;
        },
      };
    },
    rpc: async (name: string, args: Record<string, unknown>) => (rpcs.push({ name, args }), { error: null }),
  };
  return { client: client as never, updates, rpcs, mistakes };
}

const item = { id: "item-1", session_id: "s1", position: 2, attempts: 0, concept_id: "concept-1", material_id: "m1", answered_at: null } as unknown as StudySessionItem;
const session = { id: "s1", user_id: "u1", material_id: "m1", status: "in_progress" } as unknown as StudySession;
const wrong = {
  response: "I do not remember this one.",
  analysis: {},
  score: 20,
  isCorrect: false,
  responseMs: 4000,
  mistake: { question: "What does chlorophyll absorb?", correctAnswer: "Red and blue light", explanation: "Green light is reflected." },
};

describe("storing a study answer", () => {
  beforeEach(() => engine.refreshMastery.mockClear());

  it("writes only while the item is unanswered and has the attempts it was read with", async () => {
    const { client, updates } = fakeClient({ id: "item-1", attempts: 0, answered_at: null });
    expect(await storeItemAttempt(client, item, { response: "x", answered_at: "2026-10-24T10:00:00Z" })).toBe(true);
    expect(updates[0].values).toMatchObject({ attempts: 1, answered_at: "2026-10-24T10:00:00Z" });
    expect(updates[0].filters).toEqual([["eq", "id", "item-1"], ["eq", "attempts", 0], ["is", "answered_at", null]]);
    // The same attempt again finds the item answered: nothing is written.
    expect(await storeItemAttempt(client, item, { response: "x", answered_at: "2026-10-24T10:00:01Z" })).toBe(false);
  });

  it("counts, files and grades an answer sent twice at once only once", async () => {
    const { client, rpcs, mistakes } = fakeClient({ id: "item-1", attempts: 0, answered_at: null });
    const results = await Promise.all([recordItemResult(client, item, session, wrong), recordItemResult(client, item, session, wrong)]);
    expect(results.sort()).toEqual([false, true]);
    expect(rpcs).toEqual([{ name: "count_session_answer", args: { p_session_id: "s1", p_correct: false, p_index: 3 } }]);
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0]).toMatchObject({ user_id: "u1", concept_id: "concept-1", question_text: "What does chlorophyll absorb?", student_answer: "I do not remember this one." });
    expect(engine.refreshMastery).toHaveBeenCalledTimes(1);
    expect(engine.refreshMastery).toHaveBeenCalledWith(["concept-1"]);
  });

  it("settles nothing for a submit that arrives after the answer is stored", async () => {
    const { client, rpcs, mistakes } = fakeClient({ id: "item-1", attempts: 1, answered_at: "2026-10-24T10:00:00Z" });
    expect(await recordItemResult(client, item, session, wrong)).toBe(false);
    expect(rpcs).toEqual([]);
    expect(mistakes).toEqual([]);
    expect(engine.refreshMastery).not.toHaveBeenCalled();
  });
});
