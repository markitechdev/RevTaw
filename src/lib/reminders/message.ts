import { renderEmail, siteEmailOptions } from "@/lib/email/render";
import { isStudyActivity, plannerNotificationEmail, studyReminderEmail, type ReminderActivity } from "@/lib/email/templates";
import { formatClock } from "@/lib/planner/time";
import { startPhrase } from "@/lib/reminders/time";
import { routes } from "@/lib/routes";

/**
 * What a reminder says, on every channel: the bell, the browser and email
 * (UI phase §27–§29). Pure (unit-tested). The email uses RevTaw's shared
 * design: a study session's reminder (Study Reminder) or any other
 * activity's (Planner Notification), with the activity's details; the
 * renderer escapes everything that comes from the student.
 */

export type ReminderContent = {
  title: string;
  date: string;
  time: string | null;
  minutes: number;
  materialTitle: string | null;
  notes: string | null;
  remindAt: Date;
  timeZone: string | null;
  /** The activity's planner category; null for activities a study plan made. */
  category?: ReminderActivity["category"];
  /** Made by a study plan (a plan or review task) rather than added by hand. */
  planned?: boolean;
  subject?: string | null;
  /** The concepts the activity covers, shown as its topic. */
  concepts?: string[];
};

export type ReminderMessage = { title: string; body: string; href: string; subject: string; text: string; html: string };

const clip = (value: string, length: number) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "Starts in 30 minutes", "Starts now", "Today", "Tomorrow at 2:30 PM". */
export function whenLine(content: Pick<ReminderContent, "date" | "time" | "remindAt" | "timeZone">): string {
  const phrase = startPhrase(content);
  if (!content.time) return capitalize(phrase);
  if (phrase === "now") return "Starts now";
  return phrase.startsWith("in ") ? `Starts ${phrase}` : capitalize(phrase);
}

export function reminderMessage(content: ReminderContent, siteUrl: string | null, unsubscribeLink: string | null = null): ReminderMessage {
  const name = clip(content.title.replace(/\s+/g, " ").trim(), 140);
  const when = whenLine(content);
  const details = [when, `${content.minutes} min`, content.materialTitle ? clip(content.materialTitle, 80) : null].filter(Boolean).join(" · ");
  const notes = content.notes?.replace(/\s+/g, " ").trim() ? clip(content.notes.replace(/\s+/g, " ").trim(), 300) : null;
  const href = `${routes.planner}?date=${content.date}`;
  const link = siteUrl ? `${siteUrl.replace(/\/+$/, "")}${href}` : null;
  const subject = clip(`Reminder: ${name} — ${when.charAt(0).toLowerCase()}${when.slice(1)}`, 160);

  const concepts = (content.concepts ?? []).map((concept) => concept.trim()).filter(Boolean);
  const activity: ReminderActivity = {
    title: name,
    category: content.category ?? null,
    planned: content.planned ?? false,
    subject: content.subject?.trim() ? clip(content.subject.trim(), 80) : null,
    topic: concepts.length ? clip(concepts.slice(0, 3).join(", "), 120) : content.materialTitle ? clip(content.materialTitle, 120) : null,
    date: content.date,
    time: content.time ? formatClock(content.time) : null,
    minutes: content.minutes,
    notes,
  };
  const input = {
    activity,
    timing: { phrase: startPhrase(content) },
    subject,
    preheader: details,
    link,
    reason: "You get this email because email reminders are on in RevTaw → Settings → Notifications.",
    unsubscribe: unsubscribeLink ? { label: "Stop reminder emails", href: unsubscribeLink } : null,
  };
  const email = renderEmail(isStudyActivity(activity) ? studyReminderEmail(input) : plannerNotificationEmail(input), siteEmailOptions(siteUrl));
  return { title: clip(`Reminder: ${name}`, 160), body: clip(notes ? `${details}. ${notes}` : details, 600), href, subject, text: email.text, html: email.html };
}
