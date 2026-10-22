import "server-only";

import { z } from "zod";

/**
 * The short-lived cookie that ties Google's redirect back to the request
 * that started it: the OAuth state, the PKCE verifier and the student. It is
 * httpOnly, scoped to the calendar routes and expires in ten minutes.
 */

export const OAUTH_COOKIE = "revtaw_gcal_oauth";
export const OAUTH_COOKIE_PATH = "/api/calendar/google";
export const OAUTH_TTL_SECONDS = 600;

const cookieSchema = z.object({ state: z.string().min(16).max(100), verifier: z.string().min(32).max(200), userId: z.uuid(), exp: z.number() });

export type OAuthCookie = z.infer<typeof cookieSchema>;

export function sealOAuthCookie(value: OAuthCookie): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function readOAuthCookie(raw: string | undefined): OAuthCookie | null {
  if (!raw) return null;
  try {
    const parsed = cookieSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success && parsed.data.exp > Date.now() ? parsed.data : null;
  } catch {
    return null;
  }
}
