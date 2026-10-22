import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicSiteUrl, getServerEnv } from "@/lib/env";
import { sendEmail } from "@/lib/notifications/email";
import { unsubscribeHeaders, unsubscribeUrl } from "@/lib/notifications/unsubscribe";
import { isEmailConfigured } from "@/lib/notifications/email-config";
import { getPreferences } from "@/lib/preferences/queries";
import { parsePreferences, type NotificationPreferences } from "@/lib/preferences/schema";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { reminderMessage } from "@/lib/reminders/message";
import { shortTime } from "@/lib/planner/time";
import { remindAtFor } from "@/lib/reminders/time";
import type { Database, Reminder, StudyTask } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Reminders (UI phase §27–§29). Architecture:
 *
 *   planner activity ──save──▶ reminders row (remind_at, per-channel state)
 *        │                         │
 *        │      ┌──────────────────┴───────────────────┐
 *        ▼      ▼                                      ▼
 *   RevTaw open: the watcher in the browser       Scheduler: /api/cron/reminders
 *   delivers in-app at the minute (and shows a    (CRON_SECRET) claims due rows
 *   browser notification when allowed)            with the secret key, delivers
 *                                                 in-app and sends email
 *        └──────────────▶ notification service ◀──┘
 *                         (bell row, deduplicated)  ──▶ email (Resend, idempotent, one-click unsubscribe)
 *
 * Each channel is delivered at most once: the bell row has a dedupe key and
 * email_sent_at is set when the provider accepts the message. Without a
 * scheduler, in-app reminders still arrive (while RevTaw is open, or on the
 * next visit); email needs the scheduler.
 */

type Client = SupabaseClient<Database>;

const EMAIL_MAX_ATTEMPTS = 3;
/** Email for a reminder older than this is no longer useful; the bell still gets it. */
const EMAIL_STALE_MS = 6 * 60 * 60_000;
/** The watcher may deliver up to this much early (timers are not exact). */
const EARLY_MS = 30_000;

/** The scheduler needs a long secret for its endpoint and the secret key to read every student's queue. */
export function schedulerConfigured(): boolean {
  return (process.env.CRON_SECRET?.trim().length ?? 0) >= 16 && Boolean(getServerEnv().SUPABASE_SECRET_KEY);
}

/** Email reminders work only with a provider and a scheduler (they are sent when the student is away). */
export function emailRemindersAvailable(): boolean {
  return isEmailConfigured() && schedulerConfigured();
}

type TaskTiming = Pick<StudyTask, "id" | "status" | "scheduled_for" | "starts_at" | "reminder" | "reminder_minutes">;

/**
 * Keeps an activity's reminder in step with it; call after every save and
 * status change. A changed time resets delivery, so the new time is
 * reminded once; an unchanged one is left alone, so nothing is sent twice.
 */
export async function syncTaskReminder(supabase: Client, task: TaskTiming, timeZone: string | null): Promise<{ remindAt: string | null }> {
  const remindAt =
    task.status === "pending"
      ? remindAtFor({ date: task.scheduled_for, time: task.starts_at ? shortTime(task.starts_at) : null, reminder: task.reminder, reminderMinutes: task.reminder_minutes, timeZone })
      : null;
  const { data: existing } = await supabase.from("reminders").select("id, remind_at, status").eq("task_id", task.id).maybeSingle();
  if (!remindAt || remindAt.getTime() < Date.now() - 60_000) {
    if (existing?.status === "pending") await supabase.from("reminders").update({ status: "cancelled", claimed_until: null }).eq("id", existing.id);
    return { remindAt: null };
  }
  if (existing && existing.status !== "cancelled" && new Date(existing.remind_at).getTime() === remindAt.getTime()) return { remindAt: existing.remind_at };
  const row = { remind_at: remindAt.toISOString(), status: "pending" as const, in_app_sent_at: null, email_sent_at: null, email_attempts: 0, email_error: null, claimed_until: null };
  const { error } = existing ? await supabase.from("reminders").update(row).eq("id", existing.id) : await supabase.from("reminders").insert({ ...row, task_id: task.id });
  if (error) console.error("reminders: save failed", error.message);
  return { remindAt: row.remind_at };
}

/** A finished, skipped or missed activity has nothing left to remind. */
export async function cancelTaskReminder(supabase: Client, taskId: string): Promise<void> {
  const { error } = await supabase.from("reminders").update({ status: "cancelled", claimed_until: null }).eq("task_id", taskId).eq("status", "pending");
  if (error) console.error("reminders: cancel failed", error.message);
}

export type DeliveredReminder = { id: string; title: string; body: string; href: string };

type ReminderTask = Pick<StudyTask, "id" | "user_id" | "status" | "title" | "scheduled_for" | "starts_at" | "minutes" | "notes"> & { material: { title: string } | null };

const TASK_FIELDS = "id, user_id, status, title, scheduled_for, starts_at, minutes, notes, material:materials!study_tasks_material_fk(title)";

type Channels = { prefs: NotificationPreferences; timeZone: string | null; email: string | null; sendEmail: boolean; siteUrl: string | null };

type Outcome = { delivered: DeliveredReminder | null; emailed: boolean; emailFailed: boolean; cancelled: boolean };

function emailWanted(prefs: NotificationPreferences, reminder: Reminder, now: number): boolean {
  return prefs.email && emailRemindersAvailable() && !reminder.email_sent_at && reminder.email_attempts < EMAIL_MAX_ATTEMPTS && now - new Date(reminder.remind_at).getTime() < EMAIL_STALE_MS;
}

/** Delivers one due reminder on the channels that still need it and records the result. */
async function deliverOne(client: Client, reminder: Reminder, task: ReminderTask | undefined, channels: Channels): Promise<Outcome> {
  const outcome: Outcome = { delivered: null, emailed: false, emailFailed: false, cancelled: false };
  if (!task || task.status !== "pending") {
    await client.from("reminders").update({ status: "cancelled", claimed_until: null }).eq("id", reminder.id);
    return { ...outcome, cancelled: true };
  }
  const now = Date.now();
  const unsubscribe = unsubscribeUrl(channels.siteUrl, task.user_id, "reminders");
  const message = reminderMessage(
    {
      title: task.title,
      date: task.scheduled_for,
      time: task.starts_at ? shortTime(task.starts_at) : null,
      minutes: task.minutes,
      materialTitle: task.material?.title ?? null,
      notes: task.notes,
      remindAt: new Date(reminder.remind_at),
      timeZone: channels.timeZone,
    },
    channels.siteUrl,
    unsubscribe,
  );
  const update: Partial<Reminder> = { claimed_until: null };

  if (!reminder.in_app_sent_at) {
    // Settings → Notifications: the bell off, or planner reminders muted, means nothing to deliver in-app.
    if (channels.prefs.inApp && !channels.prefs.muted.includes("reminder")) {
      const { error } = await client
        .from("notifications")
        .upsert(
          { user_id: task.user_id, kind: "reminder", title: message.title, body: message.body, href: message.href, dedupe_key: `reminder:${reminder.id}:${reminder.remind_at}`.slice(0, 120) },
          { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
        );
      if (error) {
        console.error("reminders: in-app delivery failed", error.message);
        return outcome;
      }
      outcome.delivered = { id: reminder.id, title: message.title, body: message.body, href: message.href };
    }
    update.in_app_sent_at = new Date(now).toISOString();
  }

  // Email is owed when the student wants it; only the scheduler (which knows the address) sends it.
  const emailOwed = emailWanted(channels.prefs, reminder, now);
  let attempts = reminder.email_attempts;
  if (emailOwed && channels.sendEmail) {
    const result = channels.email
      ? await sendEmail({
          to: channels.email,
          subject: message.subject,
          text: message.text,
          html: message.html,
          headers: unsubscribeHeaders(unsubscribe),
          // A retried run after a timeout must not send the same reminder twice.
          idempotencyKey: `reminder-${reminder.id}-${reminder.remind_at}`,
        })
      : { ok: false as const, error: "The account has no email address." };
    if (result.ok) {
      update.email_sent_at = new Date().toISOString();
      outcome.emailed = true;
    } else {
      attempts = channels.email ? attempts + 1 : EMAIL_MAX_ATTEMPTS;
      update.email_attempts = attempts;
      update.email_error = result.error.slice(0, 300);
      outcome.emailFailed = true;
      console.error("reminders: email failed", result.error);
    }
  }
  // Still waiting for email (the scheduler sends it, or retries) keeps the reminder pending.
  const emailPending = emailOwed && !outcome.emailed && attempts < EMAIL_MAX_ATTEMPTS;
  update.status = emailPending ? "pending" : "sent";
  const { error } = await client.from("reminders").update(update).eq("id", reminder.id);
  if (error) console.error("reminders: update failed", error.message);
  return outcome;
}

/**
 * The signed-in student's due reminders, delivered in-app now: called by the
 * watcher at the minute a reminder is due and on dashboard/planner loads, so
 * reminders reach the bell even without a scheduler. Email is left to the
 * scheduler. Page loads pass `minAgeMs` so a reminder that is due right now
 * stays with the open tab's watcher, which also shows it as a browser
 * notification.
 */
export async function deliverDueReminders(options: { ids?: string[]; minAgeMs?: number } = {}): Promise<DeliveredReminder[]> {
  const supabase = await createClient();
  const dueBy = options.minAgeMs ? Date.now() - options.minAgeMs : Date.now() + EARLY_MS;
  let query = supabase
    .from("reminders")
    .select("*")
    .eq("status", "pending")
    .is("in_app_sent_at", null)
    .lte("remind_at", new Date(dueBy).toISOString())
    .order("remind_at")
    .limit(20);
  if (options.ids?.length) query = query.in("id", options.ids.slice(0, 20));
  const { data: reminders, error } = await query;
  if (error) {
    console.error("reminders: load due failed", error.message);
    return [];
  }
  if (!reminders?.length) return [];
  const [{ data: tasks }, preferences, { profile }] = await Promise.all([
    supabase.from("study_tasks").select(TASK_FIELDS).in("id", reminders.map((reminder) => reminder.task_id)),
    getPreferences(),
    getCurrentUserWithProfile(),
  ]);
  const byId = new Map(((tasks ?? []) as unknown as ReminderTask[]).map((task) => [task.id, task]));
  const channels: Channels = { prefs: preferences.notifications, timeZone: profile?.timezone ?? null, email: null, sendEmail: false, siteUrl: getPublicSiteUrl() };
  const delivered: DeliveredReminder[] = [];
  for (const reminder of reminders as Reminder[]) {
    const outcome = await deliverOne(supabase, reminder, byId.get(reminder.task_id), channels);
    if (outcome.delivered) delivered.push(outcome.delivered);
  }
  return delivered;
}

/** Reminders the watcher should time in this tab: due within the next six hours and not yet in the bell. */
export async function upcomingReminders(): Promise<Array<{ id: string; remindAt: string }>> {
  const supabase = await createClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from("reminders")
    .select("id, remind_at")
    .eq("status", "pending")
    .is("in_app_sent_at", null)
    .gte("remind_at", new Date(now - 24 * 60 * 60_000).toISOString())
    .lte("remind_at", new Date(now + 6 * 60 * 60_000).toISOString())
    .order("remind_at")
    .limit(20);
  if (error) {
    console.error("reminders: upcoming failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({ id: row.id, remindAt: row.remind_at }));
}

export type ReminderRun = { claimed: number; delivered: number; emailed: number; emailFailed: number; cancelled: number };

/**
 * The scheduler's job (every few minutes, see /api/cron/reminders): claim
 * due reminders across all students with the secret-key client and deliver
 * them in-app and by email.
 */
export async function processDueReminders(admin: Client, options: { batchSize?: number } = {}): Promise<ReminderRun> {
  const run: ReminderRun = { claimed: 0, delivered: 0, emailed: 0, emailFailed: 0, cancelled: 0 };
  const { data, error } = await admin.rpc("claim_due_reminders", { batch_size: options.batchSize ?? 50 });
  if (error) throw new Error(`reminders: claim failed: ${error.message}`);
  const reminders = (data ?? []) as Reminder[];
  run.claimed = reminders.length;
  if (reminders.length === 0) return run;

  const userIds = [...new Set(reminders.map((reminder) => reminder.user_id))];
  const [{ data: tasks }, { data: profiles }] = await Promise.all([
    admin.from("study_tasks").select(TASK_FIELDS).in("id", [...new Set(reminders.map((reminder) => reminder.task_id))]),
    admin.from("profiles").select("id, timezone, preferences").in("id", userIds),
  ]);
  const taskById = new Map(((tasks ?? []) as unknown as ReminderTask[]).map((task) => [task.id, task]));
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const emails = new Map<string, string | null>();
  if (emailRemindersAvailable()) {
    for (const id of userIds) {
      const prefs = parsePreferences(profileById.get(id)?.preferences ?? {}).notifications;
      if (!prefs.email) continue;
      const { data: user } = await admin.auth.admin.getUserById(id);
      emails.set(id, user.user?.email ?? null);
    }
  }
  const siteUrl = getPublicSiteUrl();
  for (const reminder of reminders) {
    const profile = profileById.get(reminder.user_id);
    const outcome = await deliverOne(admin, reminder, taskById.get(reminder.task_id), {
      prefs: parsePreferences(profile?.preferences ?? {}).notifications,
      timeZone: profile?.timezone ?? null,
      email: emails.get(reminder.user_id) ?? null,
      sendEmail: true,
      siteUrl,
    });
    if (outcome.delivered) run.delivered += 1;
    if (outcome.emailed) run.emailed += 1;
    if (outcome.emailFailed) run.emailFailed += 1;
    if (outcome.cancelled) run.cancelled += 1;
  }
  return run;
}
