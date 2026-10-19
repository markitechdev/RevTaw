import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { getSiteUrl } from "@/lib/env";
import { routes, safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: ReadonlySet<EmailOtpType> = new Set([
  "signup",
  "email",
  "recovery",
  "email_change",
  "magiclink",
  "invite",
]);

const DEFAULT_NEXT: Partial<Record<EmailOtpType, string>> = {
  signup: `${routes.onboarding}?verified=1`,
  email: `${routes.onboarding}?verified=1`,
  recovery: routes.resetPassword,
  email_change: `${routes.settingsAccount}?notice=email-updated`,
};

/**
 * Verifies token-hash email links. This flow does not depend on the browser
 * that started it, so links keep working when a student opens the email on a
 * different device. See supabase/README.md for the matching email templates.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = getSiteUrl();
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type || !OTP_TYPES.has(type)) {
    return NextResponse.redirect(new URL(`${routes.login}?error=link`, origin));
  }

  const next = safeNextPath(searchParams.get("next"), DEFAULT_NEXT[type] ?? routes.dashboard);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    const failure =
      type === "recovery"
        ? `${routes.forgotPassword}?error=expired`
        : type === "signup" || type === "email"
          ? `${routes.verifyEmail}?error=expired`
          : `${routes.login}?error=link`;
    return NextResponse.redirect(new URL(failure, origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
