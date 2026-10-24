import { describe, expect, it } from "vitest";

import { addMistake, resolveMistake } from "@/lib/mistakes/notebook";

type Call = { op: string; values?: Record<string, unknown>; options?: Record<string, unknown>; filters: Array<[string, string, unknown]> };

/** Records what the notebook asks of the mistakes table. */
function fakeClient() {
  const calls: Call[] = [];
  const builder = (call: Call) => {
    const chain = {
      eq: (column: string, value: unknown) => (call.filters.push(["eq", column, value]), chain),
      is: (column: string, value: unknown) => (call.filters.push(["is", column, value]), chain),
      then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
    };
    return chain;
  };
  const client = {
    from: (table: string) => {
      expect(table).toBe("mistakes");
      return {
        insert: (values: Record<string, unknown>) => builder(calls[calls.push({ op: "insert", values, filters: [] }) - 1]),
        upsert: (values: Record<string, unknown>, options: Record<string, unknown>) => builder(calls[calls.push({ op: "upsert", values, options, filters: [] }) - 1]),
        update: (values: Record<string, unknown>) => builder(calls[calls.push({ op: "update", values, filters: [] }) - 1]),
        delete: () => builder(calls[calls.push({ op: "delete", filters: [] }) - 1]),
      };
    },
  };
  return { client: client as never, calls };
}

const base = { userId: "u1", conceptId: "c1", materialId: "m1", question: "What is ATP?", studentAnswer: "sugar", correctAnswer: "The cell's energy carrier", explanation: "ATP stores energy." };

describe("the mistake notebook", () => {
  it("keeps one entry per quiz question per attempt", async () => {
    const { client, calls } = fakeClient();
    await addMistake(client, { ...base, quiz: { attemptId: "a1", questionId: "q1" } });
    expect(calls[0].op).toBe("upsert");
    expect(calls[0].options).toEqual({ onConflict: "attempt_id,question_id", ignoreDuplicates: true });
    expect(calls[0].values).toMatchObject({ attempt_id: "a1", question_id: "q1", error_type: "unclassified", question_text: "What is ATP?" });
  });

  it("adds a study item's entry, with long text cut short and an empty answer left out", async () => {
    const { client, calls } = fakeClient();
    await addMistake(client, { ...base, question: "x".repeat(5000), studentAnswer: "", correctAnswer: "", errorType: "misunderstood_concept" });
    expect(calls[0].op).toBe("insert");
    expect((calls[0].values?.question_text as string).length).toBeLessThanOrEqual(4000);
    expect(calls[0].values).toMatchObject({ student_answer: null, correct_answer: "(see the session)", error_type: "misunderstood_concept" });
    expect(calls[0].values).not.toHaveProperty("attempt_id");
  });

  it("resolves only an entry that is still open", async () => {
    const { client, calls } = fakeClient();
    await resolveMistake(client, "mistake-1");
    expect(calls[0].op).toBe("update");
    expect(calls[0].filters).toEqual([["eq", "id", "mistake-1"], ["is", "resolved_at", null]]);
  });
});
