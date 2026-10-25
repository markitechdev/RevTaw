export type AiErrorCode =
  | "not_configured"
  | "rate_limited"
  | "provider_error"
  | "invalid_output"
  | "content_too_large"
  | "unsupported"
  | "quota_exceeded";

const FRIENDLY: Record<AiErrorCode, string> = {
  not_configured: "AI features are not configured on this server yet.",
  rate_limited: "The AI service is busy right now. Please try again in a minute.",
  provider_error: "The AI service could not complete this request. Please try again.",
  invalid_output: "RevTaw could not understand the AI response. Please try again.",
  content_too_large: "This material is too large to analyze in one go.",
  unsupported: "This operation is not supported by the configured AI provider.",
  quota_exceeded: "You have used today's AI allowance. It refills at midnight, Philippine time.",
};

export type AiErrorOptions = {
  /** Student-safe message that replaces the default one for this code. */
  message?: string;
  /** Seconds the provider (or the daily limit) asks us to wait, when known. */
  retryAfterSeconds?: number;
};

/** Error with a student-safe message; `detail` is for server logs only. */
export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly detail?: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(
    code: AiErrorCode,
    detail?: string,
    retryable = code === "rate_limited" || code === "provider_error",
    options: AiErrorOptions = {},
  ) {
    super(options.message ?? FRIENDLY[code]);
    this.name = "AiError";
    this.code = code;
    this.detail = detail;
    this.retryable = retryable;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function isAiError(error: unknown): error is AiError {
  return error instanceof AiError;
}

/** Which token budget turned a call away: the student's share, the provider's total, or one that could not be checked. */
export type AiBudgetScope = "student" | "total" | "unavailable";

const BUDGET_MESSAGES: Record<AiBudgetScope, string> = {
  student: "You've used your share of RevTaw's AI for now. Some of it frees up each day.",
  total: "RevTaw's AI has reached its limit for now. Please try again later.",
  unavailable: FRIENDLY.rate_limited,
};

/**
 * A provider with a token budget (src/lib/ai/provider-budget.ts) turned a call away before sending it. The
 * router skips to the next provider without counting a failure or cooling the provider down, since another
 * student may still have budget left. Without a router, it reads as a used-up allowance.
 */
export class AiBudgetError extends AiError {
  readonly scope: AiBudgetScope;
  readonly provider: string;

  constructor(scope: AiBudgetScope, provider: string, detail: string) {
    super("quota_exceeded", detail, false, { message: BUDGET_MESSAGES[scope] });
    this.name = "AiBudgetError";
    this.scope = scope;
    this.provider = provider;
  }
}
