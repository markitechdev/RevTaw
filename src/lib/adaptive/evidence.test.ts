import { afterEach, describe, expect, it, vi } from "vitest";

import { abilityFromTotals, abilityOf, BUCKETS_TTL_MS, chunked, collectEvidence, EVIDENCE_CAPS, finalAnswer, forgetCachedBuckets, loadBuckets, optionCount, readPages } from "@/lib/adaptive/evidence";
import { fakeSupabase } from "@/test/fake-supabase";

/** A client whose item_buckets read returns the next queued result and counts the reads. */
function bucketClient(results: Array<{ data: Array<{ bucket_key: string; difficulty: number }> | null; error: { message: string } | null }>) {
  const client = { reads: 0, from: () => ({ select: () => ({ limit: async () => (client.reads++, results.shift() ?? { data: [], error: null }) }) }) };
  return client;
}

describe("evidence helpers", () => {
  it("reads past the 1,000-row page limit, newest first, up to a cap", async () => {
    const table = Array.from({ length: 2500 }, (_, index) => index);
    const ranges: Array<[number, number]> = [];
    const build = async (from: number, to: number) => {
      ranges.push([from, to]);
      return { data: table.slice(from, to + 1), error: null };
    };
    expect(await readPages(build, 10_000)).toHaveLength(2500);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    ranges.length = 0;
    expect(await readPages(build, 1500)).toHaveLength(1500);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1499],
    ]);
    await expect(readPages(async () => ({ data: null, error: { message: "denied" } }), 10)).rejects.toThrow("denied");
  });

  describe("shared item buckets", () => {
    afterEach(() => {
      forgetCachedBuckets();
      vi.restoreAllMocks();
    });

    it("reuses a good read for ten minutes, then reads again", async () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      const client = bucketClient([
        { data: [{ bucket_key: "easy:true_false:definition", difficulty: -1.2 }], error: null },
        { data: [{ bucket_key: "easy:true_false:definition", difficulty: -0.4 }], error: null },
      ]);
      expect((await loadBuckets(client as never)).get("easy:true_false:definition")).toBe(-1.2);
      now.mockReturnValue(1_000_000 + BUCKETS_TTL_MS - 1);
      expect((await loadBuckets(client as never)).get("easy:true_false:definition")).toBe(-1.2);
      expect(client.reads).toBe(1);
      now.mockReturnValue(1_000_000 + BUCKETS_TTL_MS);
      expect((await loadBuckets(client as never)).get("easy:true_false:definition")).toBe(-0.4);
      expect(client.reads).toBe(2);
    });

    it("never keeps an empty or failed read, and forgets on request", async () => {
      const client = bucketClient([
        { data: null, error: { message: "timeout" } },
        { data: [], error: null },
        { data: [{ bucket_key: "hard:essay:process", difficulty: 1.5 }], error: null },
        { data: [{ bucket_key: "hard:essay:process", difficulty: 1.1 }], error: null },
      ]);
      expect((await loadBuckets(client as never)).size).toBe(0);
      expect((await loadBuckets(client as never)).size).toBe(0);
      expect((await loadBuckets(client as never)).get("hard:essay:process")).toBe(1.5);
      expect((await loadBuckets(client as never)).get("hard:essay:process")).toBe(1.5);
      expect(client.reads).toBe(3);
      forgetCachedBuckets();
      expect((await loadBuckets(client as never)).get("hard:essay:process")).toBe(1.1);
      expect(client.reads).toBe(4);
    });
  });

  it("splits id lists, counts options and shrinks ability toward zero", () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(optionCount([{ id: "a" }, { id: "b" }, { id: "c" }])).toBe(3);
    expect(optionCount(null)).toBeNull();
    expect(abilityOf([])).toBe(0);
    // 10 answers at +1 and nothing else: halfway to +1, as if 10 more answers sat at 0.
    expect(abilityOf([{ elo_rating: 1, elo_answers: 10 }, { elo_rating: 3, elo_answers: 0 }])).toBeCloseTo(0.5, 6);
    // The database's sums (student_elo_totals) give the same ability.
    expect(abilityFromTotals(1 * 10, 10)).toBeCloseTo(abilityOf([{ elo_rating: 1, elo_answers: 10 }]), 9);
    expect(abilityFromTotals(0, 0)).toBe(0);
  });
});

describe("collectEvidence", () => {
  /** A quiz answer as the read returns it (the embedded question, and its concept as the filter sees it). */
  const answer = (index: number, conceptId: string) => ({
    id: `a${index}`,
    user_id: "u1",
    question_id: `q${index}`,
    is_correct: index % 2 === 0,
    confidence: null,
    response_ms: null,
    response: "B",
    answered_at: new Date(Date.UTC(2026, 9, 1) + index * 60_000).toISOString(),
    "question.concept_id": conceptId,
    question: { concept_id: conceptId, difficulty: "medium", type: "multiple_choice", options: [{}, {}, {}, {}] },
    attempt: { status: "submitted", mode: "exam", quiz: { feedback: null } },
  });
  const tables = (answers: ReturnType<typeof answer>[]) => ({ quiz_answers: answers, study_session_items: [], flashcard_reviews: [], mistakes: [] });

  it("groups answers by concept, oldest first, and says when a cap cut older ones off", async () => {
    const small = await collectEvidence(fakeSupabase(tables([answer(2, "c1"), answer(1, "c1"), answer(3, "c2")])).client, "u1", null);
    expect(small.truncated).toBe(false);
    expect(small.byConcept.get("c1")?.events.map((event) => event.itemKey)).toEqual(["q:q1", "q:q2"]);
    expect(small.byConcept.get("c2")?.events).toHaveLength(1);

    // An answer in a test not submitted yet can still change: it waits for the submission.
    const pending = { ...answer(4, "c3"), attempt: { status: "in_progress", mode: "exam", quiz: { feedback: null } } };
    expect((await collectEvidence(fakeSupabase(tables([pending])).client, "u1", null)).byConcept.has("c3")).toBe(false);

    const many = Array.from({ length: EVIDENCE_CAPS.answers + 5 }, (_, index) => answer(index, index < 5 ? "old" : "busy"));
    const capped = await collectEvidence(fakeSupabase(tables(many)).client, "u1", null);
    expect(capped.truncated).toBe(true);
  });
});

describe("finalAnswer", () => {
  it("counts submitted answers and practice answers checked on the spot", () => {
    expect(finalAnswer({ status: "submitted", mode: "exam", quiz: null })).toBe(true);
    expect(finalAnswer({ status: "in_progress", mode: "exam", quiz: null })).toBe(false);
    expect(finalAnswer({ status: "in_progress", mode: "practice", quiz: { feedback: "immediate" } })).toBe(true);
    // A practice quiz's default is to check each answer at once.
    expect(finalAnswer({ status: "in_progress", mode: "practice", quiz: { feedback: null } })).toBe(true);
    expect(finalAnswer({ status: "in_progress", mode: "practice", quiz: { feedback: "after" } })).toBe(false);
    expect(finalAnswer(null)).toBe(false);
  });
});
