import "server-only";

import { createClient, type CurrentUser } from "@/lib/supabase/server";

/** How long after opening a reset link a new password may be set without the old one. */
export const RECOVERY_WINDOW_SECONDS = 15 * 60;

/**
 * Sign-in methods that prove the student opened an email link just now:
 * "recovery" (PKCE reset links), "otp" (token-hash links verified by
 * /auth/confirm) and "magiclink". A session's amr keeps its original methods
 * and times through token refreshes, so an old session never qualifies.
 */
const EMAIL_LINK_METHODS = new Set(["recovery", "otp", "magiclink"]);

type AmrEntry = { method?: unknown; timestamp?: unknown };

/** Whether the JWT claims show an email-link sign-in within the recovery window. */
export function signedInByEmailLinkRecently(claims: { amr?: unknown } | null | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return false;
  return amr.some((entry: AmrEntry) => {
    if (!entry || typeof entry !== "object" || typeof entry.timestamp !== "number") return false;
    const age = nowSeconds - entry.timestamp;
    return EMAIL_LINK_METHODS.has(String(entry.method)) && age >= -60 && age <= RECOVERY_WINDOW_SECONDS;
  });
}

export type RecoveryState = { user: CurrentUser | null; fresh: boolean };

/**
 * The signed-in user and whether they may set a new password without the old
 * one (they opened a reset link in the last 15 minutes). Anyone else — a
 * session left open on a shared computer, a stolen cookie — has to use
 * Settings → Account, which asks for the current password.
 */
export async function getRecoveryState(): Promise<RecoveryState> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return { user: null, fresh: false };
  const { claims } = data;
  return {
    user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null },
    fresh: signedInByEmailLinkRecently(claims),
  };
}
