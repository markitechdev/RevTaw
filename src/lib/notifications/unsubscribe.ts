import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cronSecret } from "@/lib/server/cron-auth";

/**
 * One-click unsubscribe for every RevTaw email (RFC 8058 and Gmail's sender
 * rules). Each link carries the student's id and an HMAC of it, so nobody
 * can unsubscribe someone else. The key derives from CRON_SECRET, which
 * email already needs (only the scheduler sends it); rotating that secret
 * retires old links.
 */

export type UnsubscribeKind = "reminders" | "digest";
export const UNSUBSCRIBE_KINDS: readonly UnsubscribeKind[] = ["reminders", "digest"];

function key(): Buffer | null {
  const secret = cronSecret();
  return secret ? createHmac("sha256", secret).update("revtaw-unsubscribe-v1").digest() : null;
}

export function unsubscribeToken(userId: string, kind: UnsubscribeKind): string | null {
  const secret = key();
  return secret ? createHmac("sha256", secret).update(`${kind}:${userId}`).digest("base64url") : null;
}

export function verifyUnsubscribe(userId: string, kind: UnsubscribeKind, token: string): boolean {
  const expected = unsubscribeToken(userId, kind);
  if (!expected || !token) return false;
  const given = Buffer.from(token);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export function unsubscribeUrl(siteUrl: string | null, userId: string, kind: UnsubscribeKind): string | null {
  const token = unsubscribeToken(userId, kind);
  if (!siteUrl || !token) return null;
  const url = new URL("/api/email/unsubscribe", siteUrl);
  url.searchParams.set("u", userId);
  url.searchParams.set("k", kind);
  url.searchParams.set("t", token);
  return url.toString();
}

/** List-Unsubscribe headers so mail apps can show their own unsubscribe button. */
export function unsubscribeHeaders(url: string | null): Record<string, string> | undefined {
  return url ? { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
}
