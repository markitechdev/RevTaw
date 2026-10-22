import { after, NextResponse, type NextRequest } from "next/server";

import { track } from "@/lib/analytics/server";
import { encryptToken } from "@/lib/calendar/crypto";
import { calendarExists, createStudyCalendar, exchangeCode, GOOGLE_CALENDAR_SCOPE, revokeToken } from "@/lib/calendar/google";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, readOAuthCookie } from "@/lib/calendar/oauth-cookie";
import { CALENDAR_TIMEZONE, forgetCalendarToken, reconcileCalendar } from "@/lib/calendar/sync";
import { getServerEnv, getSiteUrl } from "@/lib/env";
import { isValidTimezone } from "@/lib/planner/dates";
import { routes } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Google's redirect after consent. Checks the state and PKCE cookie, swaps
 * the code for tokens, insists on the calendar scope and a refresh token,
 * creates (or finds) the "RevTaw Study" calendar, stores the refresh token
 * encrypted, and starts the first sync after the redirect.
 */
export async function GET(request: NextRequest) {
  const site = getSiteUrl();
  const finish = (result: string) => {
    const response = NextResponse.redirect(new URL(`${routes.settingsNotifications}?calendar=${result}#calendar`, site));
    response.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return response;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(routes.login, site));
  const params = request.nextUrl.searchParams;
  const cookie = readOAuthCookie(request.cookies.get(OAUTH_COOKIE)?.value);
  if (!cookie || cookie.userId !== user.id || params.get("state") !== cookie.state) return finish("expired");
  if (params.get("error")) return finish(params.get("error") === "access_denied" ? "denied" : "failed");
  const code = params.get("code");
  if (!code) return finish("failed");

  const admin = createAdminClient();
  const key = getServerEnv().CALENDAR_TOKEN_KEY;
  if (!admin || !key) return finish("unavailable");

  try {
    const grant = await exchangeCode(code, cookie.verifier, `${site}/api/calendar/google/callback`);
    // Google lets students untick permissions; without the calendar scope (or a refresh token) the connection is useless.
    if (!grant.scopes.includes(GOOGLE_CALENDAR_SCOPE) || !grant.refreshToken) {
      await revokeToken(grant.refreshToken ?? grant.accessToken);
      return finish(grant.scopes.includes(GOOGLE_CALENDAR_SCOPE) ? "failed" : "scope");
    }

    const [{ data: existing }, { data: profile }] = await Promise.all([
      admin.from("calendar_connections").select("calendar_id").eq("user_id", user.id).maybeSingle(),
      admin.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
    ]);
    const timeZone = isValidTimezone(profile?.timezone) ? profile.timezone : CALENDAR_TIMEZONE;
    let calendarId = existing?.calendar_id ?? null;
    if (calendarId && !(await calendarExists(grant.accessToken, calendarId))) calendarId = null;
    calendarId ??= await createStudyCalendar(grant.accessToken, timeZone);

    const { error } = await admin.from("calendar_connections").upsert({
      user_id: user.id,
      provider: "google",
      calendar_id: calendarId,
      refresh_token: encryptToken(grant.refreshToken, user.id, key),
      scope: grant.scopes.join(" "),
      status: "connected",
      last_error: null,
      connected_at: new Date().toISOString(),
    });
    if (error) throw new Error(`calendar_connections: save failed: ${error.message}`);
    forgetCalendarToken(user.id);
    track(user.id, "calendar_connected");
    after(() => reconcileCalendar(admin, user.id).then(() => undefined, (syncError) => console.warn("calendar: first sync failed", syncError instanceof Error ? syncError.message : syncError)));
    return finish("connected");
  } catch (error) {
    console.error("calendar: connecting Google Calendar failed", error instanceof Error ? error.message : error);
    return finish("failed");
  }
}
