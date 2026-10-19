import "server-only";

import { headers } from "next/headers";

/**
 * Small fixed-window rate limiter kept in process memory.
 *
 * It is a defence-in-depth layer in front of Supabase Auth's own limits and
 * is intentionally simple: counters live per server instance and reset on
 * restart. For multi-instance deployments swap the `store` for Redis/Upstash
 * while keeping the same `rateLimit()` contract.
 */

type Bucket = { count: number; resetAt: number };

const MAX_TRACKED_KEYS = 5000;
const store = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  if (store.size > MAX_TRACKED_KEYS) {
    for (const [existingKey, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(existingKey);
    }
  }

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Best-effort client address for keying limits behind common proxies. */
export async function getClientAddress(): Promise<string> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headerStore.get("x-real-ip") ?? "unknown";
}

export function describeRetry(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** Test hook: clears all counters. */
export function resetRateLimits(): void {
  store.clear();
}
