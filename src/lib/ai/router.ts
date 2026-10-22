import "server-only";

import { hasImages } from "@/lib/ai/budget";
import { AiError, isAiError } from "@/lib/ai/errors";
import type { AiGenerateOptions, AiGenerateResult, AiProvider } from "@/lib/ai/types";

/**
 * Routes one AI request through an ordered list of providers (spec: "a router
 * per task"). A provider is skipped when the request is over its budget, when
 * it cannot read images, or while it is cooling down after a 429, a 5xx or a
 * rejected key. Cool-downs live in this server instance's memory; Groq and
 * Cloudflare enforce their own limits, so a cold instance at worst pays one
 * fast 429 before moving on.
 */

type Cooldown = { until: number; reason: string };

const cooldowns = new Map<string, Cooldown>();

/** Skip a provider for 5 minutes after a 429 or 5xx (or for as long as Retry-After asks). */
export const COOLDOWN_MS = 5 * 60_000;
/** A rejected key or a missing model will not fix itself quickly. */
export const AUTH_COOLDOWN_MS = 30 * 60_000;
const MIN_COOLDOWN_MS = 15_000;
const MAX_COOLDOWN_MS = 60 * 60_000;
/** Total time one routed call may take, under the AI routes' 120-second limit. */
export const DEFAULT_DEADLINE_MS = 110_000;
/** Below this, starting another provider is pointless. */
const MIN_ATTEMPT_MS = 5_000;

function key(provider: AiProvider): string {
  return `${provider.name}:${provider.model}`;
}

export function coolingDownUntil(provider: AiProvider, now: number = Date.now()): number | null {
  const entry = cooldowns.get(key(provider));
  if (!entry) return null;
  if (entry.until <= now) {
    cooldowns.delete(key(provider));
    return null;
  }
  return entry.until;
}

/** How long a failure takes a provider out of rotation; null when the failure was about this request only. */
export function cooldownFor(error: AiError): number | null {
  switch (error.code) {
    case "rate_limited": {
      const asked = error.retryAfterSeconds !== undefined ? error.retryAfterSeconds * 1000 : COOLDOWN_MS;
      return Math.min(MAX_COOLDOWN_MS, Math.max(MIN_COOLDOWN_MS, asked));
    }
    case "provider_error":
      return error.retryable ? COOLDOWN_MS : null;
    case "not_configured":
      return AUTH_COOLDOWN_MS;
    default:
      // content_too_large, invalid_output, unsupported: the next provider may still manage.
      return null;
  }
}

export function startCooldown(provider: AiProvider, error: AiError, now: number = Date.now()): void {
  const duration = cooldownFor(error);
  if (duration === null) return;
  cooldowns.set(key(provider), { until: now + duration, reason: error.code });
}

/** Snapshot for the service check route. */
export function cooldownSnapshot(now: number = Date.now()): Array<{ provider: string; seconds: number; reason: string }> {
  return [...cooldowns.entries()]
    .filter(([, entry]) => entry.until > now)
    .map(([name, entry]) => ({ provider: name, seconds: Math.ceil((entry.until - now) / 1000), reason: entry.reason }));
}

/** Test hook. */
export function resetCooldowns(): void {
  cooldowns.clear();
  routeLog.length = 0;
}

export type RouteAttempt = {
  provider: string;
  model: string;
  outcome: "ok" | "failed" | "skipped";
  reason?: string;
  ms?: number;
};

export type RouteRecord = { at: string; task: string | null; attempts: RouteAttempt[] };

const ROUTE_LOG_SIZE = 40;
const routeLog: RouteRecord[] = [];

function logRoute(task: string | undefined, attempts: RouteAttempt[]): void {
  routeLog.push({ at: new Date().toISOString(), task: task ?? null, attempts });
  if (routeLog.length > ROUTE_LOG_SIZE) routeLog.splice(0, routeLog.length - ROUTE_LOG_SIZE);
}

/** The last routed calls on this instance, newest first (for the service check; no prompts or answers). */
export function recentRoutes(): RouteRecord[] {
  return [...routeLog].reverse();
}

export type RouterOptions = {
  deadlineMs?: number;
};

export class AiRouter implements AiProvider {
  readonly name = "auto";

  constructor(
    readonly candidates: AiProvider[],
    private readonly options: RouterOptions = {},
  ) {
    if (candidates.length === 0) {
      throw new AiError("not_configured", "AiRouter needs at least one provider");
    }
  }

  get model(): string {
    return this.candidates[0].model;
  }

  get supportsVision(): boolean {
    return this.candidates.some((candidate) => candidate.supportsVision);
  }

  fits(options: AiGenerateOptions): boolean {
    return this.candidates.some((candidate) => candidate.fits?.(options) ?? true);
  }

  async generate(options: AiGenerateOptions): Promise<AiGenerateResult> {
    const deadline = Date.now() + (this.options.deadlineMs ?? DEFAULT_DEADLINE_MS);
    const images = hasImages(options);
    const attempts: RouteAttempt[] = [];
    let lastError: AiError | null = null;

    try {
      for (const candidate of this.candidates) {
        const base = { provider: candidate.name, model: candidate.model };
        if (images && !candidate.supportsVision) {
          attempts.push({ ...base, outcome: "skipped", reason: "no vision" });
          continue;
        }
        if (candidate.fits && !candidate.fits(options)) {
          attempts.push({ ...base, outcome: "skipped", reason: "over budget" });
          continue;
        }
        if (coolingDownUntil(candidate) !== null) {
          attempts.push({ ...base, outcome: "skipped", reason: "cooling down" });
          continue;
        }
        const remaining = deadline - Date.now();
        if (remaining < MIN_ATTEMPT_MS) {
          attempts.push({ ...base, outcome: "skipped", reason: "out of time" });
          break;
        }

        const started = Date.now();
        try {
          const result = await candidate.generate({
            ...options,
            timeoutMs: Math.min(options.timeoutMs ?? Number.POSITIVE_INFINITY, remaining),
          });
          attempts.push({ ...base, outcome: "ok", ms: Date.now() - started });
          return result;
        } catch (error) {
          if (options.signal?.aborted || !isAiError(error)) throw error;
          lastError = error;
          startCooldown(candidate, error);
          attempts.push({ ...base, outcome: "failed", reason: error.code, ms: Date.now() - started });
          console.warn(
            `ai: ${candidate.name} (${candidate.model}) failed on ${options.task ?? "a request"}: ${error.code}` +
              (error.detail ? ` — ${error.detail.slice(0, 300)}` : ""),
          );
        }
      }
    } finally {
      logRoute(options.task, attempts);
    }

    if (lastError) throw lastError;
    const reasons = attempts.map((attempt) => attempt.reason);
    const detail = attempts.map((attempt) => `${attempt.provider}: ${attempt.reason}`).join("; ");
    if (reasons.includes("cooling down") || reasons.includes("out of time")) {
      throw new AiError("rate_limited", `no provider available (${detail})`);
    }
    if (images) {
      throw new AiError("unsupported", `no provider can read images (${detail})`, false);
    }
    throw new AiError("content_too_large", `request is over every provider's budget (${detail})`, false);
  }
}
