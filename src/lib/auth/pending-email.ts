import "server-only";

import { cookies } from "next/headers";

/**
 * Remembers which address is waiting for verification so the
 * "check your inbox" page can offer a resend button without ever putting the
 * email address in the URL.
 */

const COOKIE_NAME = "revtaw-pending-email";
const MAX_AGE_SECONDS = 15 * 60;

export async function setPendingEmail(email: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getPendingEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value || value.length > 254 || !value.includes("@")) return null;
  return value;
}

export async function clearPendingEmail(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
