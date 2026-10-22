import { NextResponse } from "next/server";

import { authorizationUrl, calendarConfigured, pkcePair, randomState } from "@/lib/calendar/google";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, OAUTH_TTL_SECONDS, sealOAuthCookie } from "@/lib/calendar/oauth-cookie";
import { getSiteUrl } from "@/lib/env";
import { routes } from "@/lib/routes";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings → Connect Google Calendar: sends the student to Google's consent page. */
export async function GET() {
  const site = getSiteUrl();
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`${routes.login}?next=${encodeURIComponent(routes.settingsNotifications)}`, site));
  if (!calendarConfigured()) {
    return NextResponse.redirect(new URL(`${routes.settingsNotifications}?calendar=unavailable#calendar`, site));
  }
  const state = randomState();
  const { verifier, challenge } = pkcePair();
  const response = NextResponse.redirect(authorizationUrl({ state, challenge, redirectUri: `${site}/api/calendar/google/callback` }));
  response.cookies.set(OAUTH_COOKIE, sealOAuthCookie({ state, verifier, userId: user.id, exp: Date.now() + OAUTH_TTL_SECONDS * 1000 }), {
    httpOnly: true,
    sameSite: "lax",
    secure: site.startsWith("https://"),
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_TTL_SECONDS,
  });
  return response;
}
