import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limits.
 *
 * `rateLimit()` counts in Postgres (migration 0026, `rate_limit_hit`), so the
 * limit holds across every server instance and survives deploys; keys are
 * hashed before they leave the server. Without the secret key (local
 * development) or when the database can't be reached, it falls back to the
 * in-memory counter of this instance, which is also what `localRateLimit()`
 * uses for chatty per-student checks (status polls, file views).
 */

type Bucket = { count: number; resetAt: number };

const MAX_TRACKED_KEYS = 5000;
const store = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/** This instance's counter: fast, but per instance and reset on restart. */
export function localRateLimit(
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

let warned = false;

/** Keys carry email and IP addresses; only a hash is stored. */
function storedKey(key: string): string {
  return createHash("sha256").update(key).digest("base64url");
}

/** A limit shared by every server instance (see the module comment). */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin.rpc("rate_limit_hit", {
        p_key: storedKey(key),
        p_limit: limit,
        p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
      });
      const row = data?.[0];
      if (!error && row) {
        return row.allowed
          ? { ok: true, remaining: Math.max(0, limit - row.hits), retryAfterSeconds: 0 }
          : { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, row.retry_after_seconds) };
      }
      if (error && !warned) {
        warned = true;
        console.warn(`rate limits: shared counter unavailable (${error.message}); using this instance's counter`);
      }
    } catch (error) {
      if (!warned) {
        warned = true;
        console.warn("rate limits: shared counter unavailable; using this instance's counter", error instanceof Error ? error.message : error);
      }
    }
  }
  return localRateLimit(key, limit, windowMs);
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

/** Test hook: clears this instance's counters. */
export function resetRateLimits(): void {
  store.clear();
}
