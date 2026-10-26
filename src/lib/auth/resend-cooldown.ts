/**
 * How often one address can be sent a verification email: once a minute, as
 * Supabase Auth allows by default (its minimum interval between emails to a
 * user), so the Resend button is never ready before Supabase would send.
 * Pure: the pending-verification cookie's format and the countdown's
 * arithmetic.
 */

export const VERIFICATION_RESEND_SECONDS = 60;

/** The address waiting for verification, and when it may be sent another email (epoch ms; null: now). */
export type PendingVerification = { email: string; resendAt: number | null };

function isAddress(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 254 && value.includes("@");
}

/**
 * Reads the cookie. It used to hold only the address (and does for up to 15
 * minutes after an update); anything else unreadable counts as no cookie.
 */
export function readPendingVerification(value: string | undefined): PendingVerification | null {
  if (!value) return null;
  if (!value.startsWith("{")) return isAddress(value) ? { email: value, resendAt: null } : null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const { email, resendAt } = parsed as Record<string, unknown>;
    if (!isAddress(email)) return null;
    return { email, resendAt: typeof resendAt === "number" && Number.isFinite(resendAt) ? resendAt : null };
  } catch {
    return null;
  }
}

export function pendingVerificationValue(pending: PendingVerification): string {
  return JSON.stringify({ email: pending.email, resendAt: pending.resendAt });
}

/**
 * Whole seconds until the address may be sent another email (0: now). Never
 * more than the cooldown itself, whatever a changed clock or an edited cookie
 * says; the server's own limit still decides.
 */
export function resendSecondsLeft(resendAt: number | null, now: number): number {
  if (resendAt === null) return 0;
  return Math.min(VERIFICATION_RESEND_SECONDS, Math.max(0, Math.ceil((resendAt - now) / 1000)));
}
