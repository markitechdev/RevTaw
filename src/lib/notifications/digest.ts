import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isWeakTopic } from "@/lib/adaptive/mastery";
import { getPublicSiteUrl } from "@/lib/env";
import { renderEmail, siteEmailOptions, type EmailSection } from "@/lib/email/render";
import { examEmail, reviewReminderEmail, todaysPlanEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/notifications/email";
import { isEmailConfigured } from "@/lib/notifications/email-config";
import { unsubscribeHeaders, unsubscribeUrl } from "@/lib/notifications/unsubscribe";
import { addDays, dateIn, daysBetween, DEFAULT_TIMEZONE, formatDate, hourIn, isValidTimezone } from "@/lib/planner/dates";
import { formatClock, zonedInstant } from "@/lib/planner/time";
import { parsePreferences } from "@/lib/preferences/schema";
import { routes } from "@/lib/routes";
import type { Database } from "@/lib/supabase/database.types";
import { readPages } from "@/lib/supabase/paginate";

/**
 * The daily study digest (research doc §16): one email each morning with
 * today's flashcard reviews, the day's planner activities and exam
 * countdowns, so Resend's free 100 emails a day go one per student. Sent by
 * the scheduler between 6 and 11 a.m. in the student's time zone, only to
 * students who turned it on, never twice for the same day, and not at all
 * on a day with nothing to study.
 *
 * In RevTaw's email design it leads with the most urgent thing, using that
 * email type's icon, title and button: an exam within three days (Upcoming
 * Exam, with its date, subject, plan progress and weak topics), else cards
 * due (Review Reminder), else today's plan (Planner); the rest is listed
 * below it.
 */

type Client = SupabaseClient<Database>;

const FIRST_HOUR = 6;
const LAST_HOUR = 11;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 10 * 60_000;
/** A run lasts at most a minute: a digest still "sending" after this was left behind by a run that stopped. */
const SENDING_STALE_MS = 15 * 60_000;
/** Students with the digest on, read in pages (Supabase returns at most 1,000 rows a request). */
const DIGEST_STUDENTS_MAX = 20_000;
const EXAM_HORIZON_DAYS = 14;
/** An exam this close leads the email. */
const CLOSE_EXAM_DAYS = 3;

export type DigestTask = { title: string; time: string | null; minutes: number };
export type DigestExam = {
  title: string;
  date: string;
  daysLeft: number;
  /** Read only for an exam that leads the email. */
  subject?: string | null;
  progress?: { done: number; total: number } | null;
  weakTopics?: string[];
};
export type DigestContent = { day: string; dueReviews: number; tasks: DigestTask[]; exams: DigestExam[] };
export type DigestMessage = { subject: string; text: string; html: string };
export type DigestLead = "exam" | "reviews" | "plan";

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

/** What the email leads with: an exam within three days, else cards due, else today's plan, else the next exam. */
export function digestLead(content: DigestContent): DigestLead {
  if (content.exams[0] && content.exams[0].daysLeft <= CLOSE_EXAM_DAYS) return "exam";
  if (content.dueReviews > 0) return "reviews";
  if (content.tasks.length > 0) return "plan";
  return "exam";
}

/** What the digest says (pure; the email design escapes everything from the student). */
export function digestMessage(name: string | null, content: DigestContent, siteUrl: string | null, unsubscribeLink: string | null): DigestMessage {
  // Without a public address (NEXT_PUBLIC_SITE_URL) the digest goes out without links.
  const base = siteUrl ? siteUrl.replace(/\/+$/, "") : null;
  const greeting = name?.trim() ? `Good morning, ${clip(name.trim().split(/\s+/)[0], 40)}!` : "Good morning!";
  const parts = [
    content.dueReviews > 0 ? plural(content.dueReviews, "card to review", "cards to review") : null,
    content.tasks.length > 0 ? plural(content.tasks.length, "planned activity", "planned activities") : null,
    content.exams[0] ? `${clip(content.exams[0].title, 40)} ${countdown(content.exams[0].daysLeft)}` : null,
  ].filter(Boolean);
  const subject = clip(`Today in RevTaw: ${parts.join(" · ")}`, 160);

  const lead = digestLead(content);
  const links = base
    ? { planner: `${base}${routes.planner}?date=${content.day}`, review: `${base}${routes.flashcards}/review`, smartStudy: `${base}${routes.study}?method=smart_study` }
    : null;
  const taskLines = content.tasks.map((task) => `${task.time ? `${formatClock(task.time)} · ` : ""}${clip(task.title, 120)} (${task.minutes} min)`);
  const otherExams = lead === "exam" ? content.exams.slice(1) : content.exams;
  const sections: EmailSection[] = [
    lead !== "reviews" && content.dueReviews > 0
      ? { title: "Flashcards", items: [`${plural(content.dueReviews, "card is", "cards are")} due today`], link: links ? { label: "Start reviewing", href: links.review } : null }
      : null,
    lead !== "plan" && taskLines.length ? { title: "Today's plan", items: taskLines, link: links ? { label: "View planner", href: links.planner } : null } : null,
    otherExams.length ? { title: "Exams coming up", items: otherExams.map((exam) => `${clip(exam.title, 120)}: ${countdown(exam.daysLeft)} (${formatDate(exam.date, content.day)})`) } : null,
  ].filter((section): section is EmailSection => section !== null);

  const shared = {
    subject,
    preheader: parts.join(" · "),
    greeting,
    sections,
    reason: "You get this email because the daily study digest is on in RevTaw → Settings → Notifications.",
    unsubscribe: unsubscribeLink ? { label: "Stop the daily digest", href: unsubscribeLink } : null,
  };
  const exam = content.exams[0];
  const email =
    lead === "exam" && exam
      ? examEmail({
          ...shared,
          link: links?.smartStudy ?? null,
          exam: {
            title: clip(exam.title, 80),
            daysLeft: exam.daysLeft,
            date: exam.date,
            subject: exam.subject ? clip(exam.subject, 80) : null,
            progress: exam.progress && exam.progress.total > 0 ? `${exam.progress.done} of ${plural(exam.progress.total, "planned activity", "planned activities")} done` : null,
            weakTopics: (exam.weakTopics ?? []).slice(0, 3).map((topic) => clip(topic, 60)),
          },
        })
      : lead === "reviews"
        ? reviewReminderEmail({ ...shared, link: links?.review ?? null, dueReviews: content.dueReviews })
        : todaysPlanEmail({ ...shared, link: links?.planner ?? null, tasks: content.tasks.map((task) => ({ title: clip(task.title, 120), time: task.time ? formatClock(task.time) : null, minutes: task.minutes })) });
  const rendered = renderEmail(email, siteEmailOptions(siteUrl));
  return { subject, text: rendered.text, html: rendered.html };
}

/** Today's reviews, plan and exams for one student, read with the scheduler's client. */
export async function digestContent(client: Client, userId: string, day: string, timeZone: string): Promise<DigestContent> {
  const endOfDay = zonedInstant(addDays(day, 1), "00:00", timeZone).toISOString();
  const [reviews, tasks, exams] = await Promise.all([
    client.from("flashcards").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("suspended", false).lt("due_at", endOfDay),
    client.from("study_tasks").select("title, starts_at, minutes").eq("user_id", userId).eq("scheduled_for", day).eq("status", "pending").order("starts_at", { ascending: true, nullsFirst: false }).limit(8),
    client.from("exams").select("id, title, exam_date, subject:subjects!exams_subject_fk(name)").eq("user_id", userId).is("archived_at", null).gte("exam_date", day).lte("exam_date", addDays(day, EXAM_HORIZON_DAYS)).order("exam_date").limit(5),
  ]);
  const examRows = (exams.data ?? []) as unknown as Array<{ id: string; title: string; exam_date: string; subject: { name: string } | null }>;
  const content: DigestContent = {
    day,
    dueReviews: reviews.count ?? 0,
    tasks: (tasks.data ?? []).map((task) => ({ title: task.title, time: task.starts_at, minutes: task.minutes })),
    exams: examRows.map((exam) => ({ title: exam.title, date: exam.exam_date, daysLeft: daysBetween(day, exam.exam_date), subject: exam.subject?.name ?? null })),
  };
  const close = examRows[0];
  if (close && content.exams[0].daysLeft <= CLOSE_EXAM_DAYS) Object.assign(content.exams[0], await examDetails(client, userId, close.id));
  return content;
}

/** For the exam the email leads with: how much of its plan is done, and its weakest topics. */
async function examDetails(client: Client, userId: string, examId: string): Promise<Pick<DigestExam, "progress" | "weakTopics">> {
  const [plan, links] = await Promise.all([
    client.from("study_tasks").select("status").eq("user_id", userId).eq("exam_id", examId).neq("status", "skipped").limit(1000),
    client.from("exam_materials").select("material_id").eq("user_id", userId).eq("exam_id", examId).limit(50),
  ]);
  const statuses = (plan.data ?? []) as Array<{ status: string }>;
  const materialIds = ((links.data ?? []) as Array<{ material_id: string }>).map((link) => link.material_id);
  let weakTopics: string[] = [];
  if (materialIds.length > 0) {
    // The lowest-mastery concepts, then the weak topics among them (the same definition as Home and Tamari).
    const { data } = await client
      .from("concept_mastery")
      .select("mastery, attempts, first_attempts, status, weakness, misconceptions, concept:concepts!concept_mastery_concept_fk!inner(name, links:concept_materials!inner(material_id))")
      .eq("user_id", userId)
      // Every concept that appears in one of the exam's materials, not only the ones first made from them.
      .in("concept.links.material_id", materialIds)
      .gt("attempts", 0)
      .order("mastery")
      .limit(50);
    type Row = Parameters<typeof isWeakTopic>[0] & { concept: { name: string } | null };
    weakTopics = ((data ?? []) as unknown as Row[])
      .filter(isWeakTopic)
      .map((row) => row.concept?.name ?? "")
      .filter(Boolean)
      .slice(0, 3);
  }
  return { progress: statuses.length ? { done: statuses.filter((task) => task.status === "done").length, total: statuses.length } : null, weakTopics };
}

/**
 * Claims today's digest for a student; false when it was sent or skipped, is being sent, or failed too often.
 * A failed digest is retried after ten minutes, and one left "sending" by a run that stopped after fifteen.
 */
async function claim(client: Client, userId: string, day: string): Promise<boolean> {
  const { data: inserted, error } = await client.from("email_digests").upsert({ user_id: userId, day, status: "sending", attempts: 1 }, { onConflict: "user_id,day", ignoreDuplicates: true }).select("user_id");
  if (error) throw new Error(`email_digests: claim failed: ${error.message}`);
  if (inserted && inserted.length > 0) return true;
  const { data: existing } = await client.from("email_digests").select("status, attempts, updated_at").eq("user_id", userId).eq("day", day).maybeSingle();
  if (!existing || existing.attempts >= MAX_ATTEMPTS) return false;
  const waitMs = existing.status === "failed" ? RETRY_AFTER_MS : existing.status === "sending" ? SENDING_STALE_MS : null;
  if (waitMs === null || Date.now() - new Date(existing.updated_at).getTime() < waitMs) return false;
  // Only one run can take the row back: the update matches only while it is unchanged since it was read.
  const { data: retried } = await client
    .from("email_digests")
    .update({ status: "sending", attempts: existing.attempts + 1, error: null })
    .eq("user_id", userId)
    .eq("day", day)
    .eq("status", existing.status)
    .eq("updated_at", existing.updated_at)
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

  const profiles = await readPages(
    (from, to) => client.from("profiles").select("id, display_name, timezone, preferences").eq("preferences->notifications->>digest", "true").order("id").range(from, to),
    DIGEST_STUDENTS_MAX,
  ).catch((error: unknown) => {
    throw new Error(`profiles: digest query failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  const siteUrl = getPublicSiteUrl();

  for (const profile of profiles) {
    if (Date.now() > deadline) break;
    if (!parsePreferences(profile.preferences ?? {}).notifications.digest) continue;
    run.checked += 1;
    const timeZone = isValidTimezone(profile.timezone) ? profile.timezone : DEFAULT_TIMEZONE;
    const hour = hourIn(now, timeZone);
    if (hour < FIRST_HOUR || hour >= LAST_HOUR) {
      run.notDue += 1;
      continue;
    }
    const day = dateIn(now, timeZone);
    let claimed = false;
    // One student's failure is recorded and the run goes on to the next.
    try {
      claimed = await claim(client, profile.id, day);
      if (!claimed) continue;
      const outcome = await sendDigest(client, profile, day, timeZone, siteUrl);
      run[outcome] += 1;
    } catch (error) {
      run.failed += 1;
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`digest: student ${profile.id} failed`, detail);
      if (claimed) await client.from("email_digests").update({ status: "failed", error: detail.slice(0, 300) }).eq("user_id", profile.id).eq("day", day).eq("status", "sending");
    }
  }
  return run;
}

/** Builds and sends one claimed digest and records how it went. */
async function sendDigest(client: Client, profile: { id: string; display_name: string | null }, day: string, timeZone: string, siteUrl: string | null): Promise<"sent" | "skipped" | "failed"> {
  const content = await digestContent(client, profile.id, day, timeZone);
  const { data: user, error: userError } = await client.auth.admin.getUserById(profile.id);
  if (userError) throw new Error(`auth: user lookup failed: ${userError.message}`);
  const email = user.user?.email ?? null;
  if (digestIsEmpty(content) || !email) {
    await client.from("email_digests").update({ status: "skipped", error: email ? null : "no email address" }).eq("user_id", profile.id).eq("day", day);
    return "skipped";
  }

  const unsubscribe = unsubscribeUrl(siteUrl, profile.id, "digest");
  const message = digestMessage(profile.display_name, content, siteUrl, unsubscribe);
  const result = await sendEmail({ to: email, ...message, headers: unsubscribeHeaders(unsubscribe), idempotencyKey: `digest-${profile.id}-${day}` });
  if (result.ok) {
    await client.from("email_digests").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("user_id", profile.id).eq("day", day);
    return "sent";
  }
  console.error("digest: email failed", result.error);
  await client.from("email_digests").update({ status: "failed", error: result.error.slice(0, 300) }).eq("user_id", profile.id).eq("day", day);
  return "failed";
}
