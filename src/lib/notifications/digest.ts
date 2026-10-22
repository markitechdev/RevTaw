import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSiteUrl } from "@/lib/env";
import { sendEmail } from "@/lib/notifications/email";
import { isEmailConfigured } from "@/lib/notifications/email-config";
import { unsubscribeHeaders, unsubscribeUrl } from "@/lib/notifications/unsubscribe";
import { addDays, dateIn, daysBetween, formatDate, hourIn, isValidTimezone } from "@/lib/planner/dates";
import { formatClock, zonedInstant } from "@/lib/planner/time";
import { parsePreferences } from "@/lib/preferences/schema";
import { escapeHtml } from "@/lib/reminders/message";
import { routes } from "@/lib/routes";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The daily study digest (research doc §16): one email each morning with
 * today's flashcard reviews, the day's planner activities and exam
 * countdowns, so Resend's free 100 emails a day go one per student. Sent by
 * the scheduler between 6 and 11 a.m. in the student's time zone, only to
 * students who turned it on, never twice for the same day, and not at all
 * on a day with nothing to study.
 */

type Client = SupabaseClient<Database>;

export const DIGEST_TIMEZONE = "Asia/Manila";
const FIRST_HOUR = 6;
const LAST_HOUR = 11;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 10 * 60_000;
const EXAM_HORIZON_DAYS = 14;

export type DigestTask = { title: string; time: string | null; minutes: number };
export type DigestExam = { title: string; date: string; daysLeft: number };
export type DigestContent = { day: string; dueReviews: number; tasks: DigestTask[]; exams: DigestExam[] };
export type DigestMessage = { subject: string; text: string; html: string };

const clip = (value: string, length: number) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function countdown(daysLeft: number): string {
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

export function digestIsEmpty(content: DigestContent): boolean {
  return content.dueReviews === 0 && content.tasks.length === 0 && content.exams.length === 0;
}

/** What the digest says (pure; everything from the student is escaped in the HTML). */
export function digestMessage(name: string | null, content: DigestContent, siteUrl: string, unsubscribeLink: string | null): DigestMessage {
  const base = siteUrl.replace(/\/+$/, "");
  const greeting = name?.trim() ? `Good morning, ${clip(name.trim().split(/\s+/)[0], 40)}!` : "Good morning!";
  const parts = [
    content.dueReviews > 0 ? plural(content.dueReviews, "card to review", "cards to review") : null,
    content.tasks.length > 0 ? plural(content.tasks.length, "planned activity", "planned activities") : null,
    content.exams[0] ? `${clip(content.exams[0].title, 40)} ${countdown(content.exams[0].daysLeft)}` : null,
  ].filter(Boolean);
  const subject = clip(`Today in RevTaw: ${parts.join(" · ")}`, 160);

  const taskLines = content.tasks.map((task) => `${task.time ? `${formatClock(task.time)} · ` : ""}${clip(task.title, 120)} (${task.minutes} min)`);
  const examLines = content.exams.map((exam) => `${clip(exam.title, 120)}: ${countdown(exam.daysLeft)} (${formatDate(exam.date, content.day)})`);
  const links = { dashboard: `${base}${routes.dashboard}`, planner: `${base}${routes.planner}?date=${content.day}`, flashcards: `${base}${routes.flashcards}` };

  const text = [
    greeting,
    "",
    content.dueReviews > 0 ? `Flashcards: ${plural(content.dueReviews, "card is", "cards are")} due today. ${links.flashcards}` : null,
    taskLines.length ? ["Today's plan:", ...taskLines.map((line) => `- ${line}`), links.planner].join("\n") : null,
    examLines.length ? ["Exams coming up:", ...examLines.map((line) => `- ${line}`)].join("\n") : null,
    "",
    `Open RevTaw: ${links.dashboard}`,
    "",
    "You get this email because the daily study digest is on in RevTaw → Settings → Notifications.",
    unsubscribeLink ? `Stop the daily digest: ${unsubscribeLink}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const section = (title: string, items: string[], link: string | null) =>
    `<h2 style="margin:20px 0 8px;font-size:15px">${escapeHtml(title)}</h2><ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:#4b4563">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>${link ? `<p style="margin:8px 0 0;font-size:13px"><a href="${escapeHtml(link)}" style="color:#6d3fdc">Open</a></p>` : ""}`;

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f7f6fb;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1b1530">
<div style="max-width:520px;margin:0 auto;padding:24px">
<p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6d3fdc">RevTaw · ${escapeHtml(formatDate(content.day))}</p>
<h1 style="margin:0 0 8px;font-size:20px;line-height:1.3">${escapeHtml(greeting)}</h1>
${content.dueReviews > 0 ? section("Flashcards", [`${plural(content.dueReviews, "card is", "cards are")} due today`], links.flashcards) : ""}
${taskLines.length ? section("Today's plan", taskLines, links.planner) : ""}
${examLines.length ? section("Exams coming up", examLines, null) : ""}
<p style="margin:24px 0"><a href="${escapeHtml(links.dashboard)}" style="display:inline-block;background:#6d3fdc;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:10px">Open RevTaw</a></p>
<p style="margin:0;font-size:12px;color:#77708f">You get this email because the daily study digest is on in RevTaw → Settings → Notifications.${unsubscribeLink ? ` <a href="${escapeHtml(unsubscribeLink)}" style="color:#6d3fdc">Stop the daily digest</a>` : ""}</p>
</div></body></html>`;
  return { subject, text, html };
}

/** Today's reviews, plan and exams for one student, read with the scheduler's client. */
export async function digestContent(client: Client, userId: string, day: string, timeZone: string): Promise<DigestContent> {
  const endOfDay = zonedInstant(addDays(day, 1), "00:00", timeZone).toISOString();
  const [reviews, tasks, exams] = await Promise.all([
    client.from("flashcards").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("suspended", false).lt("due_at", endOfDay),
    client.from("study_tasks").select("title, starts_at, minutes").eq("user_id", userId).eq("scheduled_for", day).eq("status", "pending").order("starts_at", { ascending: true, nullsFirst: false }).limit(8),
    client.from("exams").select("title, exam_date").eq("user_id", userId).is("archived_at", null).gte("exam_date", day).lte("exam_date", addDays(day, EXAM_HORIZON_DAYS)).order("exam_date").limit(5),
  ]);
  return {
    day,
    dueReviews: reviews.count ?? 0,
    tasks: (tasks.data ?? []).map((task) => ({ title: task.title, time: task.starts_at, minutes: task.minutes })),
    exams: (exams.data ?? []).map((exam) => ({ title: exam.title, date: exam.exam_date, daysLeft: daysBetween(day, exam.exam_date) })),
  };
}

/** Claims today's digest for a student; false when it was sent, is being sent, or failed too often. */
async function claim(client: Client, userId: string, day: string): Promise<boolean> {
  const { data: inserted, error } = await client.from("email_digests").upsert({ user_id: userId, day, status: "sending", attempts: 1 }, { onConflict: "user_id,day", ignoreDuplicates: true }).select("user_id");
  if (error) throw new Error(`email_digests: claim failed: ${error.message}`);
  if (inserted && inserted.length > 0) return true;
  const { data: existing } = await client.from("email_digests").select("status, attempts, updated_at").eq("user_id", userId).eq("day", day).maybeSingle();
  if (!existing || existing.status !== "failed" || existing.attempts >= MAX_ATTEMPTS) return false;
  if (Date.now() - new Date(existing.updated_at).getTime() < RETRY_AFTER_MS) return false;
  // Only one run can move a failed row back to "sending".
  const { data: retried } = await client
    .from("email_digests")
    .update({ status: "sending", attempts: existing.attempts + 1, error: null })
    .eq("user_id", userId)
    .eq("day", day)
    .eq("status", "failed")
    .select("user_id");
  return Boolean(retried && retried.length > 0);
}

export type DigestRun = { checked: number; sent: number; skipped: number; failed: number; notDue: number };

/**
 * One scheduler run: every student with the digest on whose local time is
 * between 6 and 11 a.m. gets today's digest once.
 */
export async function runDailyDigest(client: Client, options: { now?: Date; budgetMs?: number } = {}): Promise<DigestRun> {
  const now = options.now ?? new Date();
  const deadline = Date.now() + (options.budgetMs ?? 45_000);
  const run: DigestRun = { checked: 0, sent: 0, skipped: 0, failed: 0, notDue: 0 };
  if (!isEmailConfigured()) return run;

  const { data: profiles, error } = await client.from("profiles").select("id, display_name, timezone, preferences").eq("preferences->notifications->>digest", "true").limit(500);
  if (error) throw new Error(`profiles: digest query failed: ${error.message}`);
  const siteUrl = getSiteUrl();

  for (const profile of profiles ?? []) {
    if (Date.now() > deadline) break;
    if (!parsePreferences(profile.preferences ?? {}).notifications.digest) continue;
    run.checked += 1;
    const timeZone = isValidTimezone(profile.timezone) ? profile.timezone : DIGEST_TIMEZONE;
    const hour = hourIn(now, timeZone);
    if (hour < FIRST_HOUR || hour >= LAST_HOUR) {
      run.notDue += 1;
      continue;
    }
    const day = dateIn(now, timeZone);
    if (!(await claim(client, profile.id, day))) continue;

    const content = await digestContent(client, profile.id, day, timeZone);
    const { data: user } = await client.auth.admin.getUserById(profile.id);
    const email = user.user?.email ?? null;
    if (digestIsEmpty(content) || !email) {
      await client.from("email_digests").update({ status: "skipped", error: email ? null : "no email address" }).eq("user_id", profile.id).eq("day", day);
      run.skipped += 1;
      continue;
    }

    const unsubscribe = unsubscribeUrl(siteUrl, profile.id, "digest");
    const message = digestMessage(profile.display_name, content, siteUrl, unsubscribe);
    const result = await sendEmail({ to: email, ...message, headers: unsubscribeHeaders(unsubscribe), idempotencyKey: `digest-${profile.id}-${day}` });
    if (result.ok) {
      await client.from("email_digests").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("user_id", profile.id).eq("day", day);
      run.sent += 1;
    } else {
      console.error("digest: email failed", result.error);
      await client.from("email_digests").update({ status: "failed", error: result.error.slice(0, 300) }).eq("user_id", profile.id).eq("day", day);
      run.failed += 1;
    }
  }
  return run;
}
