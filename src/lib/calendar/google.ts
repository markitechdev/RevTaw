import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getServerEnv, type ServerEnv } from "@/lib/env";

/**
 * Google Calendar through Google's official OAuth 2.0 web-server flow
 * (research doc §16). RevTaw asks for one narrow scope, calendar.app.created:
 * it can create its own "RevTaw Study" calendar and manage events there, and
 * nothing else — it never sees the student's other calendars or their
 * Google password. Tokens stay on the server.
 */

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
export const STUDY_CALENDAR_NAME = "RevTaw Study";

const TIMEOUT_MS = 15_000;

/** Google answered that the grant is gone (revoked, expired test grant, password change): the student must reconnect. */
export class CalendarAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarAuthError";
  }
}

export class CalendarApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CalendarApiError";
  }
}

type Endpoints = { authorize: string; token: string; revoke: string; calendar: string };

function endpoints(env: ServerEnv): Endpoints {
  const test = env.GOOGLE_API_BASE_URL?.replace(/\/+$/, "");
  if (test) return { authorize: `${test}/o/oauth2/v2/auth`, token: `${test}/token`, revoke: `${test}/revoke`, calendar: `${test}/calendar/v3` };
  return {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    revoke: "https://oauth2.googleapis.com/revoke",
    calendar: "https://www.googleapis.com/calendar/v3",
  };
}

export function calendarConfigured(env: ServerEnv = getServerEnv()): boolean {
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.CALENDAR_TOKEN_KEY);
}

/** PKCE: a random verifier kept in an httpOnly cookie, and its S256 challenge sent to Google. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function randomState(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Google's consent page. access_type=offline and prompt=consent on every
 * connect (including reconnects) so Google always returns a refresh token.
 */
export function authorizationUrl(input: { state: string; challenge: string; redirectUri: string }): string {
  const env = getServerEnv();
  const url = new URL(endpoints(env).authorize);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const env = getServerEnv();
  const response = await fetch(endpoints(env).token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "", client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? "", ...body }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = ((await response.json().catch(() => ({}))) ?? {}) as TokenResponse;
  if (!response.ok) {
    if (data.error === "invalid_grant") throw new CalendarAuthError("Google no longer accepts RevTaw's access. Reconnect Google Calendar.");
    throw new CalendarApiError(`Google token endpoint: ${data.error ?? response.status}`, response.status);
  }
  return data;
}

export type Grant = { accessToken: string; refreshToken: string | null; expiresIn: number; scopes: string[] };

export async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<Grant> {
  const data = await tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri });
  if (!data.access_token) throw new CalendarApiError("Google returned no access token", 502);
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null, expiresIn: data.expires_in ?? 3600, scopes: (data.scope ?? "").split(/\s+/).filter(Boolean) };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const data = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  if (!data.access_token) throw new CalendarApiError("Google returned no access token", 502);
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 };
}

/** Best effort: the connection is removed on RevTaw's side either way. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(endpoints(getServerEnv()).revoke, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.warn("calendar: revoke failed", error instanceof Error ? error.message : error);
  }
}

async function calendarApi(accessToken: string, method: string, path: string, body?: unknown): Promise<Response> {
  const response = await fetch(`${endpoints(getServerEnv()).calendar}${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 401) throw new CalendarAuthError("Google rejected RevTaw's access. Reconnect Google Calendar.");
  return response;
}

async function failure(response: Response, what: string): Promise<CalendarApiError> {
  const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return new CalendarApiError(`${what}: ${data?.error?.message ?? response.statusText ?? response.status}`.slice(0, 280), response.status);
}

/** Creates the student's "RevTaw Study" calendar; returns its id. */
export async function createStudyCalendar(accessToken: string, timeZone: string): Promise<string> {
  const response = await calendarApi(accessToken, "POST", "/calendars", { summary: STUDY_CALENDAR_NAME, description: "Study plans and exams from RevTaw. RevTaw keeps this calendar up to date; changes here are not copied back.", timeZone });
  if (!response.ok) throw await failure(response, "creating the RevTaw Study calendar");
  const data = (await response.json()) as { id?: string };
  if (!data.id) throw new CalendarApiError("Google returned no calendar id", 502);
  return data.id;
}

export async function calendarExists(accessToken: string, calendarId: string): Promise<boolean> {
  const response = await calendarApi(accessToken, "GET", `/calendars/${encodeURIComponent(calendarId)}`);
  if (response.status === 404 || response.status === 403) return false;
  if (!response.ok) throw await failure(response, "reading the RevTaw Study calendar");
  return true;
}

export type GoogleEvent = {
  id: string;
  summary: string;
  description: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  reminders: { useDefault: false; overrides: Array<{ method: "popup"; minutes: number }> };
  source: { title: string; url: string };
  extendedProperties: { private: { revtaw: string; hash: string } };
  status: "confirmed";
};

/** Event ids and the hash of what RevTaw last wrote, for every event in a window. */
export async function listEvents(accessToken: string, calendarId: string, timeMin: string, timeMax: string): Promise<Map<string, string | null>> {
  const found = new Map<string, string | null>();
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", showDeleted: "false", maxResults: "2500", fields: "items(id,extendedProperties),nextPageToken", ...(pageToken ? { pageToken } : {}) });
    const response = await calendarApi(accessToken, "GET", `/calendars/${encodeURIComponent(calendarId)}/events?${query}`);
    if (!response.ok) throw await failure(response, "listing events");
    const data = (await response.json()) as { items?: Array<{ id: string; extendedProperties?: { private?: { hash?: string } } }>; nextPageToken?: string };
    for (const item of data.items ?? []) found.set(item.id, item.extendedProperties?.private?.hash ?? null);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return found;
}

/**
 * Writes an event under its fixed id: update it if it exists (this also
 * restores a deleted one), otherwise insert it with that id.
 */
export async function putEvent(accessToken: string, calendarId: string, event: GoogleEvent): Promise<void> {
  const path = `/calendars/${encodeURIComponent(calendarId)}/events`;
  const updated = await calendarApi(accessToken, "PUT", `${path}/${encodeURIComponent(event.id)}`, event);
  if (updated.ok) return;
  if (updated.status !== 404) throw await failure(updated, "updating an event");
  const inserted = await calendarApi(accessToken, "POST", path, event);
  if (!inserted.ok) throw await failure(inserted, "adding an event");
}

export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const response = await calendarApi(accessToken, "DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  if (response.ok || response.status === 404 || response.status === 410) return;
  throw await failure(response, "removing an event");
}
