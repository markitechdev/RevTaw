import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

import { decryptToken } from "@/lib/calendar/crypto";
import { examEvent, examEventId, taskEvent, taskEventId } from "@/lib/calendar/events";
import { CalendarApiError, CalendarAuthError, calendarConfigured, deleteEvent, listEvents, putEvent, refreshAccessToken, revokeToken, type GoogleEvent } from "@/lib/calendar/google";
import { getPublicSiteUrl, getServerEnv } from "@/lib/env";
import { addDays, dateIn, DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/planner/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { readPages } from "@/lib/supabase/paginate";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * One-way sync from the planner to the student's "RevTaw Study" calendar.
 * Each run reconciles a window (two weeks back, four months ahead): it
 * lists the events there, writes the activities and exams whose content
 * changed, and removes events whose activity was deleted, skipped or moved
 * out. Runs are serialized per student on this instance; the hourly job
 * catches anything a run missed.
 */

type Client = SupabaseClient<Database>;

const DAYS_BACK = 14;
const DAYS_AHEAD = 120;
/** Activities read per run; past this the window is only partly read. */
const MAX_TASKS = 2000;
/** Only events RevTaw made; anything the student adds to this calendar stays. */
const REVTAW_EVENT_ID = /^(ta|ea)[0-9a-f]{32}$/;

/** Access tokens by student, tagged with the grant they came from. */
const tokens = new Map<string, { grant: string; token: string; expiresAt: number }>();
const running = new Map<string, Promise<unknown>>();

export type SyncOutcome = { written: number; removed: number; unchanged: number };

/** Identifies a stored grant without keeping the token: a reconnect (even to another Google account) never reuses an old access token. */
export function grantFingerprint(sealedRefreshToken: string): string {
  return createHash("sha256").update(sealedRefreshToken).digest("base64url").slice(0, 16);
}

async function accessToken(userId: string, sealedRefreshToken: string): Promise<string> {
  const grant = grantFingerprint(sealedRefreshToken);
  const cached = tokens.get(userId);
  if (cached && cached.grant === grant && cached.expiresAt > Date.now() + 60_000) return cached.token;
  let refreshToken: string;
  try {
    refreshToken = decryptToken(sealedRefreshToken, userId, getServerEnv().CALENDAR_TOKEN_KEY!);
  } catch {
    // CALENDAR_TOKEN_KEY changed, or the stored value is damaged: only a new consent helps.
    throw new CalendarAuthError("RevTaw can no longer read its saved Google Calendar access. Reconnect Google Calendar.");
  }
  const { accessToken: token, expiresIn } = await refreshAccessToken(refreshToken);
  tokens.set(userId, { grant, token, expiresAt: Date.now() + expiresIn * 1000 });
  return token;
}

export function forgetCalendarToken(userId: string): void {
  tokens.delete(userId);
}

/**
 * Revokes RevTaw's Google Calendar access for a student and forgets the stored
 * token: Settings → Disconnect, and account deletion. Revoking at Google is
 * best effort; the token is removed on RevTaw's side either way. Returns
 * whether the stored connection was removed.
 */
export async function revokeCalendarGrant(client: Client, userId: string): Promise<boolean> {
  const { data: connection } = await client.from("calendar_connections").select("refresh_token").eq("user_id", userId).maybeSingle();
  const key = getServerEnv().CALENDAR_TOKEN_KEY;
  if (connection?.refresh_token && key) {
    try {
      await revokeToken(decryptToken(connection.refresh_token, userId, key));
    } catch (error) {
      console.warn("calendar: could not read the token to revoke it", error instanceof Error ? error.message : error);
    }
  }
  const { error } = await client.from("calendar_connections").delete().eq("user_id", userId);
  forgetCalendarToken(userId);
  if (error) console.error("calendar: could not remove the connection", error.message);
  return !error;
}

function friendly(error: unknown): string {
  if (error instanceof CalendarAuthError) return error.message;
  if (error instanceof CalendarApiError && error.status === 404) return "The RevTaw Study calendar is gone from Google Calendar. Reconnect to create it again.";
  if (error instanceof CalendarApiError && error.status === 403) return "Google refused the change (permissions or the daily quota). RevTaw will try again later.";
  return "RevTaw couldn't reach Google Calendar. It will try again later.";
}

async function reconcileOnce(client: Client, userId: string): Promise<SyncOutcome | null> {
  if (!calendarConfigured()) return null;
  const { data: connection } = await client.from("calendar_connections").select("calendar_id, refresh_token, status").eq("user_id", userId).maybeSingle();
  if (!connection || connection.status === "needs_reconnect" || !connection.refresh_token || !connection.calendar_id) return null;

  try {
    const token = await accessToken(userId, connection.refresh_token);
    const { data: profile } = await client.from("profiles").select("timezone").eq("id", userId).maybeSingle();
    const timeZone = isValidTimezone(profile?.timezone) ? profile.timezone : DEFAULT_TIMEZONE;
    const today = dateIn(new Date(), timeZone);
    const from = addDays(today, -DAYS_BACK);
    const to = addDays(today, DAYS_AHEAD);
    const [tasks, exams] = await Promise.all([
      readPages(
        (first, last) => client.from("study_tasks").select("id, title, scheduled_for, starts_at, minutes, status, notes, reminder, reminder_minutes").eq("user_id", userId).gte("scheduled_for", from).lte("scheduled_for", to).in("status", ["pending", "done"]).order("scheduled_for").order("id").range(first, last),
        MAX_TASKS,
      ).catch((error: unknown) => {
        throw new Error(`calendar: planner query failed: ${error instanceof Error ? error.message : String(error)}`);
      }),
      client.from("exams").select("id, title, exam_date, notes").eq("user_id", userId).is("archived_at", null).gte("exam_date", from).lte("exam_date", to).limit(300),
    ]);
    if (exams.error) throw new Error(`calendar: planner query failed: ${exams.error.message}`);
    // With the window only partly read, an activity's event may belong to one that was not read: keep those this run.
    const allTasksRead = tasks.length < MAX_TASKS;

    const siteUrl = getPublicSiteUrl();
    const wanted = new Map<string, GoogleEvent>();
    for (const task of tasks) wanted.set(taskEventId(task.id), taskEvent(task, { timeZone, siteUrl }));
    for (const exam of exams.data ?? []) wanted.set(examEventId(exam.id), examEvent(exam, { siteUrl }));

    // A day of margin on both sides covers every time zone.
    const existing = await listEvents(token, connection.calendar_id, `${addDays(from, -1)}T00:00:00Z`, `${addDays(to, 2)}T00:00:00Z`);
    const outcome: SyncOutcome = { written: 0, removed: 0, unchanged: 0 };
    for (const [id, event] of wanted) {
      if (existing.get(id) === event.extendedProperties.private.hash) {
        outcome.unchanged += 1;
        continue;
      }
      await putEvent(token, connection.calendar_id, event);
      outcome.written += 1;
    }
    for (const id of existing.keys()) {
      if (wanted.has(id) || !REVTAW_EVENT_ID.test(id)) continue;
      if (!allTasksRead && id.startsWith("ta")) continue;
      await deleteEvent(token, connection.calendar_id, id);
      outcome.removed += 1;
    }
    await client.from("calendar_connections").update({ status: "connected", last_synced_at: new Date().toISOString(), last_error: null }).eq("user_id", userId);
    return outcome;
  } catch (error) {
    const reconnect = error instanceof CalendarAuthError || (error instanceof CalendarApiError && error.status === 404);
    if (reconnect) forgetCalendarToken(userId);
    await client.from("calendar_connections").update({ status: reconnect ? "needs_reconnect" : "error", last_error: friendly(error).slice(0, 300) }).eq("user_id", userId);
    throw error;
  }
}

/** Brings the student's RevTaw Study calendar in line with the planner (one run at a time per student). */
export async function reconcileCalendar(client: Client, userId: string): Promise<SyncOutcome | null> {
  const previous = running.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => reconcileOnce(client, userId));
  running.set(userId, next);
  try {
    return await next;
  } finally {
    if (running.get(userId) === next) running.delete(userId);
  }
}

/** After a planner change: sync the signed-in student's calendar once the response is sent. */
export function syncCalendarAfterChange(): void {
  if (!calendarConfigured()) return;
  const run = async () => {
    const admin = createAdminClient();
    const user = await getCurrentUser();
    if (!admin || !user) return;
    await reconcileCalendar(admin, user.id).catch((error) => console.warn("calendar: sync after a change failed", error instanceof Error ? error.message : error));
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

export type CalendarRun = { students: number; synced: number; failed: number };

/**
 * The hourly job: every connected student, within a time budget. Rows whose
 * last sync failed are retried too (Google outages and quota pass); rows
 * that need reconnecting wait for the student.
 */
export async function reconcileAllCalendars(client: Client, budgetMs = 50_000): Promise<CalendarRun> {
  const deadline = Date.now() + budgetMs;
  const { data: connections, error } = await client.from("calendar_connections").select("user_id").in("status", ["connected", "error"]).order("last_synced_at", { ascending: true, nullsFirst: true }).limit(500);
  if (error) throw new Error(`calendar_connections: query failed: ${error.message}`);
  const run: CalendarRun = { students: connections?.length ?? 0, synced: 0, failed: 0 };
  for (const connection of connections ?? []) {
    if (Date.now() > deadline) break;
    try {
      await reconcileCalendar(client, connection.user_id);
      run.synced += 1;
    } catch {
      run.failed += 1;
    }
  }
  return run;
}
