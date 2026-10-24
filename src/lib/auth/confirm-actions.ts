"use server";

import { redirect } from "next/navigation";

import { CONFIRM_NEXT, confirmFailurePath, isConfirmType, isTokenHash } from "@/lib/auth/confirm";
import { errorState, formString, type ActionState } from "@/lib/forms/action-state";
import { describeRetry, getClientAddress, rateLimit } from "@/lib/rate-limit";
import { routes, safeNextPath } from "@/lib/routes";
import { createAuthClient } from "@/lib/supabase/auth-client";

/**
 * Uses an email link when the student presses the button on /auth/confirm.
 * Only POST (a Server Action, which Next.js accepts only from RevTaw's own
 * pages) uses the link; opening the link only shows the button.
 */
export async function confirmEmailLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const tokenHash = formString(formData, "token_hash");
  const type = formString(formData, "type");
  if (!isTokenHash(tokenHash) || !isConfirmType(type)) {
    redirect(`${routes.login}?error=link`);
  }

  const ip = await getClientAddress();
  const limit = await rateLimit(`confirm:${ip}`, 30, 15 * 60_000);
  if (!limit.ok) {
    return errorState(`Too many attempts. Please try again in ${describeRetry(limit.retryAfterSeconds)}.`);
  }

  const next = safeNextPath(formString(formData, "next"), CONFIRM_NEXT[type]);
  const auth = await createAuthClient();
  const { error } = await auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    redirect(confirmFailurePath(type));
  }
  redirect(next);
}
