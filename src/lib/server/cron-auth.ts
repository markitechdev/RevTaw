import "server-only";

import { timingSafeEqual } from "node:crypto";

/** CRON_SECRET when it is long enough to be a real secret (16+ characters), else null. */
export function cronSecret(): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

/**
 * True when the request carries `Authorization: Bearer <CRON_SECRET>`.
 * Schedulers (Vercel Cron, Supabase pg_cron + pg_net, GitHub Actions) and
 * the service check use it. Compared in constant time.
 */
export function hasCronSecret(request: Request): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;
  const given = Buffer.from(token);
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
