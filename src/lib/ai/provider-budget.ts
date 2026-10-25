import "server-only";

import { DEFAULT_MAX_TOKENS, estimateRequestTokens } from "@/lib/ai/budget";
import { AiBudgetError, isAiError, type AiErrorCode } from "@/lib/ai/errors";
import { later } from "@/lib/ai/quota";
import type { AiGenerateOptions, AiGenerateResult, AiProvider, AiUsage } from "@/lib/ai/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Token budgets for an AI provider whose free allowance every student
 * shares (Ollama Cloud's free plan: a monthly allowance, counted in tokens,
 * that resets on the day the account signed up).
 *
 * Before each call, Postgres (migration 0034) checks the provider's total
 * budget and the student's share and sets the call's estimated tokens aside;
 * after it, the estimate is swapped for the tokens the provider reported. A
 * call that does not fit is turned away with AiBudgetError, which the router
 * treats as a skip. When the budget cannot be checked (no
 * SUPABASE_SECRET_KEY, or the migration has not been run), the provider is
 * not used at all: going past the allowance is the one thing this must not
 * do.
 *
 * Budgets count today and the BUDGET_WINDOW_DAYS days before it (UTC). An
 * allowance period of up to 31 days always lies inside that window, so
 * whichever day the allowance resets, no period sees more than the total.
 */

export const BUDGET_WINDOW_DAYS = 31;

export type ProviderBudget = {
  /** Tokens (input plus output) all students together may use in the window. */
  total: number;
  /** Tokens one student may use in the window. */
  student: number;
};

/** The SQL functions' ranges. */
const MAX_BUDGET = 100_000_000_000;
const MAX_CALL_TOKENS = 2_000_000;

function parseAmount(value: string | undefined): number | null {
  const match = value?.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!match) return null;
  const amount = Math.round(Number(match[1]) * (match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1));
  return Number.isSafeInteger(amount) && amount <= MAX_BUDGET ? amount : null;
}

/**
 * Reads a budget such as "total=300000,student=30000" ("300k" and "1.5m"
 * work too). When only the total is given, a student's share is a tenth of
 * it; a share is never larger than the total. Unreadable values keep the
 * defaults.
 */
export function parseProviderBudget(raw: string | undefined, defaults: ProviderBudget): ProviderBudget {
  let total: number | undefined;
  let student: number | undefined;
  for (const pair of (raw ?? "").split(",")) {
    const [name, value] = pair.split("=").map((part) => part?.trim().toLowerCase());
    const amount = parseAmount(value);
    if (amount === null) continue;
    if (name === "total") total = amount;
    if (name === "student") student = amount;
  }
  const resolvedTotal = total ?? defaults.total;
  const resolvedStudent = student ?? (total !== undefined ? Math.floor(total / 10) : defaults.student);
  return { total: resolvedTotal, student: Math.min(resolvedStudent, resolvedTotal) };
}

type Reservation = { provider: string; studentId: string | null; day: string; tokens: number };

const warned = new Set<string>();

function unavailable(provider: string, detail: string): AiBudgetError {
  if (!warned.has(provider)) {
    warned.add(provider);
    console.warn(
      `ai: ${provider} is not being used because its token budget cannot be checked (${detail}). ` +
        "Set SUPABASE_SECRET_KEY and run supabase/migrations/0034_ai_provider_budget.sql.",
    );
  }
  return new AiBudgetError("unavailable", provider, `${provider} budget unavailable: ${detail}`);
}

async function reserve(provider: string, studentId: string | null, tokens: number, budget: ProviderBudget): Promise<Reservation> {
  const admin = createAdminClient();
  if (!admin) throw unavailable(provider, "SUPABASE_SECRET_KEY is not set");
  const { data, error } = await admin.rpc("reserve_ai_provider_tokens", {
    p_provider: provider,
    p_user_id: studentId,
    p_tokens: tokens,
    p_total_limit: budget.total,
    p_student_limit: budget.student,
    p_days: BUDGET_WINDOW_DAYS,
  });
  if (error) throw unavailable(provider, `${error.code ?? "error"}: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw unavailable(provider, "no answer from reserve_ai_provider_tokens");
  if (!row.allowed) {
    const scope = row.reason === "student" ? "student" : "total";
    const used = scope === "student" ? row.student_used : row.total_used;
    throw new AiBudgetError(scope, provider, `${provider} ${scope} budget: ${used} used + ${tokens} needed > ${budget[scope]}`);
  }
  return { provider, studentId, day: row.usage_day, tokens };
}

function clampTokens(value: number): number {
  return Math.min(MAX_CALL_TOKENS, Math.max(0, Math.round(value || 0)));
}

/** Swaps the reservation for what the call used, after the response is sent. */
function settle(reservation: Reservation, used: AiUsage): void {
  const admin = createAdminClient();
  if (!admin) return;
  later(async () => {
    const { error } = await admin.rpc("settle_ai_provider_tokens", {
      p_provider: reservation.provider,
      p_user_id: reservation.studentId,
      p_day: reservation.day,
      p_reserved: reservation.tokens,
      p_input_tokens: clampTokens(used.inputTokens),
      p_output_tokens: clampTokens(used.outputTokens),
    });
    if (error) console.warn(`ai: ${reservation.provider} token budget not settled`, error.message);
  });
}

/** Failures where the provider refused the call before running a model, so it cost nothing. */
const REFUSED: readonly AiErrorCode[] = ["rate_limited", "not_configured", "content_too_large", "unsupported", "quota_exceeded"];

/** The student a call counts against: as MeteredProvider passed it, else whoever is signed in (none for scripts and jobs). */
async function studentFor(options: AiGenerateOptions): Promise<string | null> {
  if (options.studentId) return options.studentId;
  try {
    return (await getCurrentUser())?.id ?? null;
  } catch {
    return null; // outside a request
  }
}

type Estimating = AiProvider & {
  /** Estimated input tokens plus the most the call may write, when the provider knows better than the default. */
  requestTokens?(options: AiGenerateOptions): number;
};

/** Wraps a provider so each call must fit its token budget first (see the comment at the top). */
export class BudgetedProvider implements AiProvider {
  constructor(
    readonly inner: Estimating,
    readonly budget: ProviderBudget,
  ) {}

  get name(): string {
    return this.inner.name;
  }

  get model(): string {
    return this.inner.model;
  }

  get supportsVision(): boolean {
    return this.inner.supportsVision;
  }

  get timeoutMs(): number | undefined {
    return this.inner.timeoutMs;
  }

  fits(options: AiGenerateOptions): boolean {
    return this.inner.fits?.(options) ?? true;
  }

  /** Tokens set aside before a call: the request's estimated size plus the most it may write. */
  estimate(options: AiGenerateOptions): number {
    const tokens = this.inner.requestTokens?.(options) ?? estimateRequestTokens(options, options.maxTokens ?? DEFAULT_MAX_TOKENS);
    return Math.min(MAX_CALL_TOKENS, Math.max(1, Math.ceil(tokens)));
  }

  async generate(options: AiGenerateOptions): Promise<AiGenerateResult> {
    const reservation = await reserve(this.name, await studentFor(options), this.estimate(options), this.budget);
    try {
      const result = await this.inner.generate(options);
      const reported = (result.usage.inputTokens || 0) + (result.usage.outputTokens || 0) > 0;
      // A reply without token counts is charged at the estimate.
      settle(reservation, reported ? result.usage : { inputTokens: reservation.tokens, outputTokens: 0 });
      return result;
    } catch (error) {
      // A refused call costs nothing; one that failed after the model may have run (a timeout, a broken
      // answer) is charged at the estimate, since its real count is unknown.
      const refused = isAiError(error) && REFUSED.includes(error.code);
      settle(reservation, refused ? { inputTokens: 0, outputTokens: 0 } : { inputTokens: reservation.tokens, outputTokens: 0 });
      throw error;
    }
  }
}

export type ProviderBudgetSummary = {
  limits: ProviderBudget;
  /** Days counted, today included (UTC). */
  windowDays: number;
  state: "ok" | "used up" | "unavailable";
  detail?: string;
  used?: number;
  left?: number;
  inputTokens?: number;
  outputTokens?: number;
  reservedTokens?: number;
  requests?: number;
  students?: number;
  mostByOneStudent?: number;
};

/** For the service check: how much of a budget the window has used (totals only; no student is named). */
export async function providerBudgetSummary(provider: string, budget: ProviderBudget): Promise<ProviderBudgetSummary> {
  const base = { limits: budget, windowDays: BUDGET_WINDOW_DAYS + 1 };
  const admin = createAdminClient();
  if (!admin) return { ...base, state: "unavailable", detail: "SUPABASE_SECRET_KEY is not set" };
  const { data, error } = await admin.rpc("ai_provider_usage_summary", { p_provider: provider, p_days: BUDGET_WINDOW_DAYS });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return { ...base, state: "unavailable", detail: error ? `${error.code ?? "error"}: ${error.message}` : "no answer" };
  const used = Number(row.input_tokens) + Number(row.output_tokens) + Number(row.reserved_tokens);
  return {
    ...base,
    state: used >= budget.total ? "used up" : "ok",
    used,
    left: Math.max(0, budget.total - used),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    reservedTokens: Number(row.reserved_tokens),
    requests: Number(row.requests),
    students: Number(row.students),
    mostByOneStudent: Number(row.most_by_one_student),
  };
}
