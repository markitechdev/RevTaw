import "server-only";

import { after } from "next/server";

import { AiError, isAiError } from "@/lib/ai/errors";
import type { AiGenerateOptions, AiGenerateResult, AiProvider, AiUsage } from "@/lib/ai/types";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiUsageKind } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Each student's daily AI allowance (the "budget governor").
 *
 * Every AI call made while a student is signed in takes one request from
 * today's allowance for its kind, in Postgres (migration 0016), so the limit
 * holds across server instances. Repairs of a malformed answer are free, a
 * request every provider failed is given back, and token counts are added
 * after each call so real request sizes can be measured.
 *
 * Limits come from AI_DAILY_LIMITS, e.g. "chat=60,generate=10"; "off" turns
 * the allowance off. Calls without a signed-in student (scripts, tests) are
 * not counted. If the database function is missing, calls go through and
 * the server logs a warning once.
 */

export const AI_USAGE_KINDS = ["chat", "generate", "study", "upload", "voice"] as const satisfies readonly AiUsageKind[];

export const DEFAULT_DAILY_LIMITS: Record<AiUsageKind, number> = {
  chat: 60,
  generate: 10,
  study: 60,
  upload: 30,
  voice: 60,
};

const TASK_KIND: Record<string, AiUsageKind> = {
  tutor_reply: "chat",
  tutor_evaluate: "chat",
  generate_reviewer: "generate",
  regenerate_section: "generate",
  generate_quiz: "generate",
  generate_flashcards: "generate",
  analyze_material: "upload",
  ocr_image: "upload",
};

/** Which allowance a task draws from; study methods and grading are "study". */
export function usageKindForTask(task: string | undefined): AiUsageKind {
  return (task && TASK_KIND[task]) || "study";
}

/** Parses AI_DAILY_LIMITS. Returns null when limits are turned off. */
export function parseDailyLimits(raw: string | undefined): Record<AiUsageKind, number> | null {
  const limits = { ...DEFAULT_DAILY_LIMITS };
  const value = raw?.trim();
  if (!value) return limits;
  if (/^(off|none|false|disabled)$/i.test(value)) return null;
  for (const pair of value.split(",")) {
    const [name, amount] = pair.split("=").map((part) => part?.trim().toLowerCase());
    if (!name || !(AI_USAGE_KINDS as readonly string[]).includes(name)) continue;
    const parsed = Number(amount);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 100_000) {
      limits[name as AiUsageKind] = parsed;
    }
  }
  return limits;
}

export function getDailyLimits(): Record<AiUsageKind, number> | null {
  return parseDailyLimits(getServerEnv().AI_DAILY_LIMITS);
}

const FEATURE: Record<AiUsageKind, string> = {
  chat: "Tamari chat",
  generate: "AI generation of reviewers, quizzes and flashcards",
  study: "AI feedback in study methods",
  upload: "AI reading of uploads",
  voice: "Voice",
};

/** Student-facing message for a reached limit. */
export function limitMessage(kind: AiUsageKind, limit: number): string {
  if (limit === 0) return `${FEATURE[kind]} is turned off on this RevTaw server.`;
  switch (kind) {
    case "chat":
      return `You've used today's ${limit} Tamari messages. They refill at midnight, Philippine time.`;
    case "generate":
      return `You've made today's ${limit} AI reviewers, quizzes and flashcard sets. More unlock at midnight, Philippine time.`;
    case "study":
      return `You've used today's ${limit} AI study checks. They refill at midnight, Philippine time.`;
    case "upload":
      return `RevTaw has used today's ${limit} AI reads for your uploads (photos and analysis). They refill at midnight, Philippine time.`;
    case "voice":
      return `You've used today's ${limit} voice requests. Typing still works, and voice refills at midnight, Philippine time.`;
  }
}

export type AiQuotaTicket = { kind: AiUsageKind; studentId: string };

let warnedUnavailable = false;

function warnUnavailable(detail: string): void {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.warn(`ai: daily AI limits are not being enforced (${detail}). Run supabase/migrations/0016_ai_usage.sql.`);
}

/** Runs a database write after the response is sent, or now when outside a request. */
function later(task: () => Promise<void>): void {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      console.warn("ai: usage write failed", error instanceof Error ? error.message : error);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Takes one request from the signed-in student's allowance for `kind`.
 * Throws AiError("quota_exceeded") with a friendly message when it is used
 * up; returns null when nothing was counted.
 */
export async function consumeAiRequest(kind: AiUsageKind): Promise<AiQuotaTicket | null> {
  const limits = getDailyLimits();
  if (!limits) return null;

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return null; // outside a request: no student to count against
  }

  const { data, error } = await supabase.rpc("consume_ai_request", { p_kind: kind, p_daily_limit: limits[kind] });
  if (error) {
    // 42501: nobody is signed in. Anything else: fail open, but say so once.
    if (error.code !== "42501") warnUnavailable(`${error.code ?? "error"}: ${error.message}`);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  if (!row.allowed) {
    const resetsIn = Math.ceil((Date.parse(row.resets_at) - Date.now()) / 1000);
    throw new AiError("quota_exceeded", `daily ${kind} limit of ${row.daily_limit} reached`, false, {
      message: limitMessage(kind, row.daily_limit),
      retryAfterSeconds: Number.isFinite(resetsIn) ? Math.max(60, resetsIn) : undefined,
    });
  }
  return { kind, studentId: row.student_id };
}

/** Adds a finished call's tokens to the student's row (after the response is sent). */
export function recordAiTokens(kind: AiUsageKind, usage: AiUsage): void {
  if (!getDailyLimits()) return;
  const input = Math.min(2_000_000, Math.max(0, Math.round(usage.inputTokens || 0)));
  const output = Math.min(2_000_000, Math.max(0, Math.round(usage.outputTokens || 0)));
  if (input === 0 && output === 0) return;
  // Read the session cookies now, while the request is still in scope.
  const client = createClient().catch(() => null);
  later(async () => {
    const supabase = await client;
    if (!supabase) return;
    const { error } = await supabase.rpc("add_ai_tokens", { p_kind: kind, p_input_tokens: input, p_output_tokens: output });
    if (error && error.code !== "42501") warnUnavailable(`${error.code ?? "error"}: ${error.message}`);
  });
}

/** Gives a request back when every provider failed. Needs SUPABASE_SECRET_KEY. */
export function refundAiRequest(ticket: AiQuotaTicket): void {
  const admin = createAdminClient();
  if (!admin) return;
  later(async () => {
    const { error } = await admin.rpc("refund_ai_request", { p_user_id: ticket.studentId, p_kind: ticket.kind });
    if (error) console.warn("ai: refund failed", error.message);
  });
}

/** Wraps a provider (or the router) so every call is metered against the student's allowance. */
export class MeteredProvider implements AiProvider {
  constructor(readonly inner: AiProvider) {}

  get name(): string {
    return this.inner.name;
  }

  get model(): string {
    return this.inner.model;
  }

  get supportsVision(): boolean {
    return this.inner.supportsVision;
  }

  fits(options: AiGenerateOptions): boolean {
    return this.inner.fits?.(options) ?? true;
  }

  async generate(options: AiGenerateOptions): Promise<AiGenerateResult> {
    const kind = usageKindForTask(options.task);
    const ticket = (options.attempt ?? 1) > 1 ? null : await consumeAiRequest(kind);
    try {
      const result = await this.inner.generate(options);
      recordAiTokens(kind, result.usage);
      return result;
    } catch (error) {
      if (ticket && isAiError(error)) refundAiRequest(ticket);
      throw error;
    }
  }
}
