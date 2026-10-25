import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const adminRpc = vi.fn();
const deferred: Array<() => Promise<void>> = [];
let adminClient: { rpc: typeof adminRpc } | null = { rpc: adminRpc };
let signedIn: { id: string } | null = null;

vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => deferred.push(task) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}), getCurrentUser: async () => signedIn }));

import { AiBudgetError, AiError } from "@/lib/ai/errors";
import { BUDGET_WINDOW_DAYS, BudgetedProvider, parseProviderBudget, providerBudgetSummary } from "@/lib/ai/provider-budget";
import type { AiGenerateOptions, AiProvider } from "@/lib/ai/types";

async function flush() {
  while (deferred.length) await deferred.shift()!();
}

const budget = { total: 100_000, student: 10_000 };
const ask: AiGenerateOptions = { task: "tutor_reply", studentId: "u1", messages: [{ role: "user", content: "Hi" }], maxTokens: 500 };
const allowed = { data: [{ allowed: true, reason: null, usage_day: "2026-10-25", total_used: 1_500, student_used: 1_500 }], error: null };

function inner(outcome: "ok" | "no usage" | AiError = "ok") {
  const calls: AiGenerateOptions[] = [];
  const provider: AiProvider & { requestTokens(options: AiGenerateOptions): number } = {
    name: "ollama_cloud",
    model: "gpt-oss:120b",
    supportsVision: false,
    timeoutMs: 90_000,
    requestTokens: () => 1_500,
    async generate(options) {
      calls.push(options);
      if (outcome instanceof AiError) throw outcome;
      const usage = outcome === "no usage" ? { inputTokens: 0, outputTokens: 0 } : { inputTokens: 700, outputTokens: 90 };
      return { text: "OK", usage, provider: "ollama_cloud", model: "gpt-oss:120b" };
    },
  };
  return { provider, calls };
}

beforeEach(() => {
  adminRpc.mockReset();
  deferred.length = 0;
  adminClient = { rpc: adminRpc };
  signedIn = null;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseProviderBudget", () => {
  const defaults = { total: 300_000, student: 30_000 };

  it("keeps the defaults when nothing is set", () => {
    expect(parseProviderBudget(undefined, defaults)).toEqual(defaults);
    expect(parseProviderBudget("", defaults)).toEqual(defaults);
  });

  it("reads both budgets, with k and m", () => {
    expect(parseProviderBudget("total=500000, student=40000", defaults)).toEqual({ total: 500_000, student: 40_000 });
    expect(parseProviderBudget("TOTAL=1.5m,student=25k", defaults)).toEqual({ total: 1_500_000, student: 25_000 });
  });

  it("gives each student a tenth of a total set alone, and never more than the total", () => {
    expect(parseProviderBudget("total=2m", defaults)).toEqual({ total: 2_000_000, student: 200_000 });
    expect(parseProviderBudget("total=1000,student=5000", defaults)).toEqual({ total: 1_000, student: 1_000 });
    expect(parseProviderBudget("student=50000", defaults)).toEqual({ total: 300_000, student: 50_000 });
  });

  it("ignores values it cannot read", () => {
    expect(parseProviderBudget("total=lots,student=-5,days=7,off", defaults)).toEqual(defaults);
  });
});

describe("BudgetedProvider", () => {
  it("sets the estimate aside first, then swaps it for the reported tokens after the response", async () => {
    adminRpc.mockResolvedValueOnce(allowed).mockResolvedValue({ data: null, error: null });
    const { provider, calls } = inner();
    const result = await new BudgetedProvider(provider, budget).generate(ask);
    expect(result.text).toBe("OK");
    expect(calls).toHaveLength(1);
    expect(adminRpc).toHaveBeenCalledWith("reserve_ai_provider_tokens", {
      p_provider: "ollama_cloud",
      p_user_id: "u1",
      p_tokens: 1_500,
      p_total_limit: 100_000,
      p_student_limit: 10_000,
      p_days: BUDGET_WINDOW_DAYS,
    });
    expect(adminRpc).toHaveBeenCalledTimes(1);
    await flush();
    expect(adminRpc).toHaveBeenLastCalledWith("settle_ai_provider_tokens", {
      p_provider: "ollama_cloud",
      p_user_id: "u1",
      p_day: "2026-10-25",
      p_reserved: 1_500,
      p_input_tokens: 700,
      p_output_tokens: 90,
    });
  });

  it("turns a call away when the student's share or the total would be passed, before sending it", async () => {
    const { provider, calls } = inner();
    const budgeted = new BudgetedProvider(provider, budget);

    adminRpc.mockResolvedValueOnce({ data: [{ allowed: false, reason: "student", usage_day: "2026-10-25", total_used: 40_000, student_used: 9_000 }], error: null });
    const student = await budgeted.generate(ask).catch((error: unknown) => error);
    expect(student).toBeInstanceOf(AiBudgetError);
    expect(student).toMatchObject({ scope: "student", code: "quota_exceeded", retryable: false });
    expect((student as AiError).detail).toBe("ollama_cloud student budget: 9000 used + 1500 needed > 10000");
    expect((student as AiError).message).toMatch(/your share of RevTaw's AI/);

    adminRpc.mockResolvedValueOnce({ data: [{ allowed: false, reason: "total", usage_day: "2026-10-25", total_used: 99_000, student_used: 0 }], error: null });
    const total = await budgeted.generate(ask).catch((error: unknown) => error);
    expect(total).toMatchObject({ scope: "total" });
    expect((total as AiError).message).toMatch(/reached its limit/);

    expect(calls).toHaveLength(0);
    await flush();
    expect(adminRpc).toHaveBeenCalledTimes(2); // nothing to settle
  });

  it("is not used at all when the budget cannot be checked, and says why once", async () => {
    const { provider, calls } = inner();
    const budgeted = new BudgetedProvider(provider, budget);
    adminRpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function public.reserve_ai_provider_tokens" } });
    await expect(budgeted.generate(ask)).rejects.toMatchObject({ scope: "unavailable" });
    await expect(budgeted.generate(ask)).rejects.toMatchObject({ scope: "unavailable" });

    adminClient = null;
    const noKey = await budgeted.generate(ask).catch((error: unknown) => error);
    expect(noKey).toMatchObject({ scope: "unavailable" });
    expect((noKey as AiError).message).toBe("The AI service is busy right now. Please try again in a minute.");

    expect(calls).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0][0]).toMatch(/0034_ai_provider_budget\.sql/);
  });

  it("gives back a refused call's reservation and charges the estimate when the model may have run", async () => {
    adminRpc.mockResolvedValue(allowed);
    const refused = inner(new AiError("rate_limited", "ollama_cloud responded with HTTP 429", true));
    await expect(new BudgetedProvider(refused.provider, budget).generate(ask)).rejects.toMatchObject({ code: "rate_limited" });
    await flush();
    expect(adminRpc).toHaveBeenLastCalledWith("settle_ai_provider_tokens", expect.objectContaining({ p_reserved: 1_500, p_input_tokens: 0, p_output_tokens: 0 }));

    const timedOut = inner(new AiError("provider_error", "AI request timed out"));
    await expect(new BudgetedProvider(timedOut.provider, budget).generate(ask)).rejects.toMatchObject({ code: "provider_error" });
    await flush();
    expect(adminRpc).toHaveBeenLastCalledWith("settle_ai_provider_tokens", expect.objectContaining({ p_reserved: 1_500, p_input_tokens: 1_500, p_output_tokens: 0 }));
  });

  it("charges the estimate when the reply has no token counts", async () => {
    adminRpc.mockResolvedValue(allowed);
    await new BudgetedProvider(inner("no usage").provider, budget).generate(ask);
    await flush();
    expect(adminRpc).toHaveBeenLastCalledWith("settle_ai_provider_tokens", expect.objectContaining({ p_input_tokens: 1_500, p_output_tokens: 0 }));
  });

  it("charges whoever is signed in when no student was passed, and only the total for scripts", async () => {
    adminRpc.mockResolvedValue(allowed);
    const { provider } = inner();
    const budgeted = new BudgetedProvider(provider, budget);
    signedIn = { id: "u2" };
    await budgeted.generate({ messages: [{ role: "user", content: "Hi" }] });
    expect(adminRpc).toHaveBeenLastCalledWith("reserve_ai_provider_tokens", expect.objectContaining({ p_user_id: "u2" }));
    signedIn = null;
    await budgeted.generate({ messages: [{ role: "user", content: "Hi" }] });
    expect(adminRpc).toHaveBeenLastCalledWith("reserve_ai_provider_tokens", expect.objectContaining({ p_user_id: null }));
  });

  it("estimates from the request when the provider has no estimate of its own", () => {
    const plain: AiProvider = { name: "x", model: "m", supportsVision: false, generate: async () => ({ text: "", usage: { inputTokens: 0, outputTokens: 0 }, provider: "x", model: "m" }) };
    // 320 characters ≈ 100 tokens, 8 for the message, plus the 500 the call may write.
    expect(new BudgetedProvider(plain, budget).estimate({ messages: [{ role: "user", content: "y".repeat(320) }], maxTokens: 500 })).toBe(608);
  });
});

describe("providerBudgetSummary", () => {
  it("reports the window's totals against the budget", async () => {
    adminRpc.mockResolvedValueOnce({
      data: [{ requests: 12, input_tokens: 60_000, output_tokens: 9_000, reserved_tokens: 1_000, students: 3, most_by_one_student: 8_000 }],
      error: null,
    });
    expect(await providerBudgetSummary("ollama_cloud", budget)).toEqual({
      limits: budget,
      windowDays: BUDGET_WINDOW_DAYS + 1,
      state: "ok",
      used: 70_000,
      left: 30_000,
      inputTokens: 60_000,
      outputTokens: 9_000,
      reservedTokens: 1_000,
      requests: 12,
      students: 3,
      mostByOneStudent: 8_000,
    });
    expect(adminRpc).toHaveBeenCalledWith("ai_provider_usage_summary", { p_provider: "ollama_cloud", p_days: BUDGET_WINDOW_DAYS });
  });

  it("says when the budget is used up or cannot be read", async () => {
    adminRpc.mockResolvedValueOnce({ data: [{ requests: 50, input_tokens: 90_000, output_tokens: 10_000, reserved_tokens: 0, students: 9, most_by_one_student: 10_000 }], error: null });
    expect(await providerBudgetSummary("ollama_cloud", budget)).toMatchObject({ state: "used up", left: 0 });
    adminRpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "missing" } });
    expect(await providerBudgetSummary("ollama_cloud", budget)).toMatchObject({ state: "unavailable", detail: "PGRST202: missing" });
  });
});
