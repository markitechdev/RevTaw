import "server-only";

import { connection } from "next/server";

import { getServerEnv } from "@/lib/env";
import { getClientAddress } from "@/lib/rate-limit";
import { TURNSTILE_RESPONSE_FIELD, type TurnstileAction } from "@/lib/security/turnstile-shared";
import { forwardableAddress } from "@/lib/supabase/forwarding";

/**
 * Cloudflare Turnstile, a bot check on the forms that create accounts, sign
 * in or send email: sign-up, sign-in, the reset link and the verification
 * resend. It is off until TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are
 * both set.
 *
 * The browser solves the check and posts its one-time token with the form
 * (`cf-turnstile-response`); the Server Action confirms the token with
 * Cloudflare's siteverify API before it calls Supabase Auth.
 *
 * RevTaw checks the token itself rather than passing it to Supabase's own
 * CAPTCHA setting: a token can be confirmed only once, and Supabase skips its
 * check for requests made with the secret key, which RevTaw uses to forward
 * the student's address (src/lib/supabase/auth-client.ts). Leave "Enable
 * CAPTCHA protection" off in Supabase.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 8_000;
/** Cloudflare's documented maximum token length. */
const MAX_TOKEN_LENGTH = 2048;

export type { TurnstileAction };

export const TURNSTILE_MESSAGES = {
  missing: "Complete the security check, then try again.",
  rejected: "The security check expired or did not go through. Please try again.",
  unavailable: "We could not run the security check just now. Please try again in a moment.",
} as const;

export type TurnstileResult = { ok: true } | { ok: false; message: string };

/** "on" with both keys, "off" with neither; "incomplete" (one key) makes the checked forms refuse requests. */
export function turnstileState(): "on" | "off" | "incomplete" {
  const env = getServerEnv();
  if (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY) return "on";
  return env.TURNSTILE_SITE_KEY || env.TURNSTILE_SECRET_KEY ? "incomplete" : "off";
}

/** The site key the sign-in pages render the check with, read at request time; undefined while Turnstile is off. */
export async function turnstileSiteKey(): Promise<string | undefined> {
  await connection();
  return getServerEnv().TURNSTILE_SITE_KEY;
}

const reported = new Set<string>();

function reportOnce(key: string, message: string): void {
  if (reported.has(key)) return;
  reported.add(key);
  console.error(`turnstile: ${message}`);
}

/** Confirms the form's Turnstile token for `action`. Always passes while Turnstile is off. */
export async function verifyTurnstile(formData: FormData, action: TurnstileAction): Promise<TurnstileResult> {
  const env = getServerEnv();
  const secret = env.TURNSTILE_SECRET_KEY;
  const state = turnstileState();
  if (state === "off") return { ok: true };
  if (state === "incomplete" || !secret) {
    // Half configured: refuse instead of quietly letting every request through.
    reportOnce("config", "set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, or neither; the checked forms are refused until then");
    return { ok: false, message: TURNSTILE_MESSAGES.unavailable };
  }

  const token = formData.get(TURNSTILE_RESPONSE_FIELD);
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, message: TURNSTILE_MESSAGES.missing };
  }
  if (token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, message: TURNSTILE_MESSAGES.rejected };
  }

  const body = new URLSearchParams({ secret, response: token });
  const remoteIp = forwardableAddress(await getClientAddress());
  if (remoteIp) body.set("remoteip", remoteIp);

  let answer: unknown;
  try {
    const response = await fetch(env.TURNSTILE_VERIFY_URL ?? SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`siteverify answered ${response.status}`);
    answer = await response.json();
  } catch (error) {
    console.error("turnstile: siteverify failed", error instanceof Error ? error.message : error);
    return { ok: false, message: TURNSTILE_MESSAGES.unavailable };
  }

  const outcome = readOutcome(answer);
  if (!outcome) {
    console.error("turnstile: siteverify sent an unexpected answer");
    return { ok: false, message: TURNSTILE_MESSAGES.unavailable };
  }
  if (outcome.errorCodes.includes("missing-input-secret") || outcome.errorCodes.includes("invalid-input-secret")) {
    reportOnce("secret", "Cloudflare does not accept TURNSTILE_SECRET_KEY; use the secret key of the widget TURNSTILE_SITE_KEY belongs to");
    return { ok: false, message: TURNSTILE_MESSAGES.unavailable };
  }
  if (outcome.errorCodes.includes("internal-error")) {
    return { ok: false, message: TURNSTILE_MESSAGES.unavailable };
  }
  if (!outcome.success) {
    return { ok: false, message: TURNSTILE_MESSAGES.rejected };
  }
  // A real widget echoes the action its form set; Cloudflare's test keys answer with none.
  if (outcome.action && outcome.action !== action) {
    return { ok: false, message: TURNSTILE_MESSAGES.rejected };
  }
  return { ok: true };
}

function readOutcome(value: unknown): { success: boolean; errorCodes: string[]; action: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.success !== "boolean") return null;
  const codes = record["error-codes"];
  return {
    success: record.success,
    errorCodes: Array.isArray(codes) ? codes.filter((code): code is string => typeof code === "string") : [],
    action: typeof record.action === "string" ? record.action : "",
  };
}

/** Test hook: lets each test see the one-time configuration warnings again. */
export function resetTurnstileReports(): void {
  reported.clear();
}
