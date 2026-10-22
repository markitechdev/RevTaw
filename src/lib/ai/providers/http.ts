import "server-only";

import { AiError } from "@/lib/ai/errors";

const DEFAULT_TIMEOUT_MS = 90_000;

/** fetch with a hard timeout, merged with the caller's abort signal. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("AI request timed out")), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new AiError("provider_error", error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Reads a Retry-After header given in seconds or as an HTTP date. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Math.ceil(Number(trimmed)));
  }
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

/** Maps an HTTP error response to an AiError without leaking the body to users. */
export async function statusToAiError(provider: string, response: Response): Promise<AiError> {
  let detail = `${provider} responded with HTTP ${response.status}`;
  try {
    const body = await response.text();
    detail += `: ${body.slice(0, 500)}`;
  } catch {
    // ignore body read failures
  }
  const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));

  // 404 means a wrong model name or base URL: a configuration problem, not a transient one.
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return new AiError("not_configured", detail, false);
  }
  if (response.status === 429) {
    return new AiError("rate_limited", detail, true, { retryAfterSeconds });
  }
  if (response.status === 413) {
    return new AiError("content_too_large", detail, false);
  }
  if (response.status >= 500 || response.status === 408 || response.status === 529) {
    return new AiError("provider_error", detail, true, { retryAfterSeconds });
  }
  return new AiError("provider_error", detail, false);
}
