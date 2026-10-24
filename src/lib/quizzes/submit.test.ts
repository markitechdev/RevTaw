import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  refreshMastery: vi.fn(async () => {}),
  awardAttemptXp: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.client }));
vi.mock("@/lib/adaptive/engine", () => ({ refreshMastery: mocks.refreshMastery, defaultDifficulty: vi.fn(), difficultyTargets: vi.fn(), weakConceptNames: vi.fn() }));
vi.mock("@/lib/gamification/service", () => ({ awardAttemptXp: mocks.awardAttemptXp }));
vi.mock("@/lib/ai", () => ({ isAiError: () => false }));
vi.mock("@/lib/quizzes/grade", () => ({ gradeObjective: vi.fn(), gradeOpenAnswers: vi.fn(), normalizeText: (text: string) => text }));
vi.mock("@/lib/quizzes/generate", () => ({ generateQuiz: vi.fn() }));
vi.mock("@/lib/reviewers/service", () => ({ friendlyGenerationFailure: vi.fn(), loadMaterialContext: vi.fn() }));
vi.mock("@/lib/concepts/service", () => ({ ensureConcepts: vi.fn(), normalizeConceptName: (name: string) => name }));
vi.mock("@/lib/generation/retry", () => ({ claimForRetry: vi.fn(), retryRefusal: vi.fn() }));

const { submitAttempt } = await import("@/lib/quizzes/service");

type Attempt = { id: string; quiz_id: string; user_id: string; status: string; started_at: string; time_limit_seconds: null; submit_started_at: string | null };
type Filter = [op: "eq" | "is" | "lt", column: string, value: unknown];

const matches = (row: Record<string, unknown>, filters: Filter[]) =>
  filters.every(([op, column, value]) => (op === "lt" ? row[column] !== null && String(row[column]) < String(value) : row[column] === value));

/**
 * One quiz attempt in memory, with one multiple-choice question answered wrong. An update applies only
 * when its filters match the row at that moment, as Postgres does when two updates meet on one row.
 */
function fakeClient(attempt: Attempt, options: { answerError?: boolean } = {}) {
  const counts = { gradings: 0, mistakes: 0, submits: 0 };
  const question = { id: "question-1", type: "multiple_choice", prompt: "What does chlorophyll absorb?", options: [{ id: "a", text: "Green light" }, { id: "b", text: "Red and blue light" }], answer: { option_id: "b" }, explanation: "Green light is reflected.", concept_id: "concept-1", points: 1 };
  const answer = { id: "answer-1", question_id: "question-1", response: { option_id: "a" }, is_correct: false, score: 0, feedback: null, graded_by: "auto" };
  const client = {
    from(table: string) {
      if (table === "quiz_attempts") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { ...attempt, quiz: { material_id: "m1", title: "Cell biology" } }, error: null }) }),
          }),
          update(values: Partial<Attempt>) {
            const filters: Filter[] = [];
            const apply = () => {
              if (!matches(attempt, filters)) return [];
              Object.assign(attempt, values);
              if (values.status === "submitted") counts.submits += 1;
              return [{ id: attempt.id }];
            };
            const chain = {
              eq: (column: string, value: unknown) => (filters.push(["eq", column, value]), chain),
              is: (column: string, value: unknown) => (filters.push(["is", column, value]), chain),
              lt: (column: string, value: unknown) => (filters.push(["lt", column, value]), chain),
              select: async () => ({ data: apply(), error: null }),
              then: (resolve: (value: { error: null }) => void) => (apply(), resolve({ error: null })),
            };
            return chain;
          },
        };
      }
      if (table === "quiz_questions") {
        return { select: () => ({ eq: async () => (counts.gradings += 1, { data: [question], error: null }) }) };
      }
      if (table === "quiz_answers") {
        return {
          select: () => ({ eq: async () => ({ data: options.answerError ? [] : [answer], error: null }) }),
          upsert: async () => ({ error: options.answerError ? { message: "connection reset" } : null }),
        };
      }
      if (table === "mistakes") return { upsert: async () => (counts.mistakes += 1, { error: null }) };
      throw new Error(`unexpected table ${table}`);
    },
  };
  mocks.client = client;
  return counts;
}

const openAttempt = (overrides: Partial<Attempt> = {}): Attempt => ({ id: "attempt-1", quiz_id: "quiz-1", user_id: "u1", status: "in_progress", started_at: "2026-10-24T10:00:00Z", time_limit_seconds: null, submit_started_at: null, ...overrides });

describe("submitting a quiz attempt", () => {
  beforeEach(() => {
    mocks.refreshMastery.mockClear();
    mocks.awardAttemptXp.mockClear();
  });

  it("grades an attempt sent twice at once only once", async () => {
    const attempt = openAttempt();
    const counts = fakeClient(attempt);
    const results = await Promise.all([submitAttempt(attempt.id, { waitMs: 3000 }), submitAttempt(attempt.id, { waitMs: 3000 })]);
    expect(results).toEqual([
      { submitted: true, needsSelfCheck: 0 },
      { submitted: true, needsSelfCheck: 0 },
    ]);
    expect(counts).toEqual({ gradings: 1, mistakes: 1, submits: 1 });
    expect(mocks.awardAttemptXp).toHaveBeenCalledTimes(1);
    expect(attempt.status).toBe("submitted");
  });

  it("does not grade an attempt that is already submitted", async () => {
    const counts = fakeClient(openAttempt({ status: "submitted" }));
    expect(await submitAttempt("attempt-1")).toEqual({ submitted: true, needsSelfCheck: 0 });
    expect(counts).toEqual({ gradings: 0, mistakes: 0, submits: 0 });
  });

  it("asks for a reload when another submission keeps grading", async () => {
    const counts = fakeClient(openAttempt({ submit_started_at: new Date().toISOString() }));
    await expect(submitAttempt("attempt-1", { waitMs: 1200 })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/still being submitted/) });
    expect(counts.gradings).toBe(0);
  });

  it("takes over a submission that was cut off", async () => {
    const attempt = openAttempt({ submit_started_at: new Date(Date.now() - 4 * 60_000).toISOString() });
    const counts = fakeClient(attempt);
    expect(await submitAttempt(attempt.id)).toEqual({ submitted: true, needsSelfCheck: 0 });
    expect(counts.gradings).toBe(1);
  });

  it("lets the next try take the attempt at once when grading fails", async () => {
    const attempt = openAttempt();
    fakeClient(attempt, { answerError: true });
    await expect(submitAttempt(attempt.id)).rejects.toThrow(/finalize failed/);
    expect(attempt).toMatchObject({ status: "in_progress", submit_started_at: null });
  });
});
