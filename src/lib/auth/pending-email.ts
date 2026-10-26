import "server-only";

import { cookies } from "next/headers";

import { pendingVerificationValue, readPendingVerification, resendSecondsLeft } from "@/lib/auth/resend-cooldown";

/**
 * Remembers which address is waiting for verification, and when it may be
 * sent another email, so the "check your inbox" page can offer a resend
 * button with its countdown without ever putting the email address in the
 * URL.
 */

const COOKIE_NAME = "revtaw-pending-email";
const MAX_AGE_SECONDS = 15 * 60;

/**
 * `resendAfterSeconds`: an email was just sent to the address (or one was
 * refused as too soon), so the next may go after that many seconds. Left out
 * when nothing was sent (signing in to an unverified account): the address
 * keeps the wait it had, and another address starts with none.
 */
export async function setPendingEmail(email: string, resendAfterSeconds?: number): Promise<void> {
  const cookieStore = await cookies();
  const current = readPendingVerification(cookieStore.get(COOKIE_NAME)?.value);
  const resendAt =
    resendAfterSeconds !== undefined ? Date.now() + resendAfterSeconds * 1000 : current?.email === email ? current.resendAt : null;
  cookieStore.set(COOKIE_NAME, pendingVerificationValue({ email, resendAt }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * The address waiting for verification and the seconds until it may be sent
 * another email (0: now). `resendAt` changes with every email sent, so the
 * page can start a new countdown for each.
 */
export async function getPendingVerification(): Promise<{ email: string; resendAt: number | null; resendInSeconds: number } | null> {
  const cookieStore = await cookies();
  const pending = readPendingVerification(cookieStore.get(COOKIE_NAME)?.value);
  if (!pending) return null;
  return { ...pending, resendInSeconds: resendSecondsLeft(pending.resendAt, Date.now()) };
}

export async function getPendingEmail(): Promise<string | null> {
  return (await getPendingVerification())?.email ?? null;
}

export async function clearPendingEmail(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
