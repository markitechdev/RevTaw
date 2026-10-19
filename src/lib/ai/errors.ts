export type AiErrorCode =
  | "not_configured"
  | "rate_limited"
  | "provider_error"
  | "invalid_output"
  | "content_too_large"
  | "unsupported";

const FRIENDLY: Record<AiErrorCode, string> = {
  not_configured: "AI features are not configured on this server yet.",
  rate_limited: "The AI service is busy right now. Please try again in a minute.",
  provider_error: "The AI service could not complete this request. Please try again.",
  invalid_output: "RevTaw could not understand the AI response. Please try again.",
  content_too_large: "This material is too large to analyze in one go.",
  unsupported: "This operation is not supported by the configured AI provider.",
};

/** Error with a student-safe message; `detail` is for server logs only. */
export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly detail?: string;
  readonly retryable: boolean;

  constructor(code: AiErrorCode, detail?: string, retryable = code === "rate_limited" || code === "provider_error") {
    super(FRIENDLY[code]);
    this.name = "AiError";
    this.code = code;
    this.detail = detail;
    this.retryable = retryable;
  }
}

export function isAiError(error: unknown): error is AiError {
  return error instanceof AiError;
}
