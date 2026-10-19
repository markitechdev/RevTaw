import { NextResponse, type NextRequest } from "next/server";

import { getSiteUrl } from "@/lib/env";
import { routes, safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Completes PKCE email flows (sign-up confirmation, password recovery, email
 * change). Supabase redirects here with a one-time `code` which is exchanged
 * for a session and stored in HTTP-only cookies.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // Redirect against the public site URL: behind `next start` or a reverse
  // proxy the request origin can be the internal hostname, which would send
  // the browser to a host where its cookies do not exist.
  const origin = getSiteUrl();
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), routes.dashboard);
  const failure = failureRedirect(next);

  if (!code) {
    return NextResponse.redirect(new URL(failure, origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL(failure, origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}

/** Sends the user to the page that can issue a fresh link for the flow. */
function failureRedirect(next: string): string {
  if (next.startsWith(routes.resetPassword)) {
    return `${routes.forgotPassword}?error=expired`;
  }
  if (next.startsWith(routes.onboarding)) {
    return `${routes.verifyEmail}?error=expired`;
  }
  return `${routes.login}?error=link`;
}
