import "server-only";

import { SUPABASE_TEMPLATES, supabaseTemplateHtml } from "@/lib/email/auth-templates";
import { renderEmail, siteEmailOptions } from "@/lib/email/render";
import { notificationEmail, welcomeEmail } from "@/lib/email/templates";
import { digestMessage, type DigestContent } from "@/lib/notifications/digest";
import { reminderMessage, type ReminderContent } from "@/lib/reminders/message";

/**
 * Every RevTaw email with sample data, as the student would get it: the Supabase templates with their
 * placeholders filled in, and the app's emails from the same functions the senders use. For the preview
 * pages at /dev/emails (development only) and the tests that check every email.
 */

export type EmailSample = { id: string; name: string; group: string; render: (siteUrl: string | null) => { html: string; text: string | null } };

const UNSUBSCRIBE = (siteUrl: string | null, kind: string) => (siteUrl ? `${siteUrl}/api/email/unsubscribe?u=sample&k=${kind}&t=sample` : null);

const reminder: ReminderContent = {
  title: "Biology reviewer: Cellular respiration",
  date: "2026-10-27",
  time: "14:30",
  minutes: 45,
  materialTitle: "Biology 2 — Cellular respiration",
  notes: null,
  remindAt: new Date("2026-10-27T06:00:00Z"),
  timeZone: "Asia/Manila",
  category: "study",
  planned: false,
  subject: "Biology",
  concepts: ["Glycolysis", "Krebs cycle"],
};

const day: DigestContent = {
  day: "2026-10-25",
  dueReviews: 12,
  tasks: [
    { title: "Biology reviewer", time: "14:30:00", minutes: 25 },
    { title: "Read chapter 3", time: null, minutes: 20 },
  ],
  exams: [{ title: "Calculus exam", date: "2026-10-28", daysLeft: 3, subject: "Calculus", progress: { done: 4, total: 10 }, weakTopics: ["Chain rule", "Implicit differentiation"] }],
};

const SAMPLE_VALUES: Record<string, string> = { "{{ .TokenHash }}": "pkce_0123456789abcdef", "{{ .Email }}": "ana@example.com", "{{ .NewEmail }}": "ana.cruz@school.edu.ph" };

export const EMAIL_SAMPLES: readonly EmailSample[] = [
  ...SUPABASE_TEMPLATES.map((template) => ({
    id: template.file.replace(/\.html$/, ""),
    name: template.name,
    group: "Account (Supabase)",
    render: (siteUrl: string | null) => {
      let html = supabaseTemplateHtml(template).replaceAll("{{ .SiteURL }}", siteUrl ?? "https://revtaw.com");
      for (const [placeholder, value] of Object.entries(SAMPLE_VALUES)) html = html.replaceAll(placeholder, value);
      return { html, text: null };
    },
  })),
  { id: "study-reminder", name: "Study reminder: starts in 30 minutes", group: "Planner reminders", render: (siteUrl) => reminderMessage(reminder, siteUrl, UNSUBSCRIBE(siteUrl, "reminders")) },
  {
    id: "study-reminder-later",
    name: "Study reminder: coming up tomorrow",
    group: "Planner reminders",
    render: (siteUrl) => reminderMessage({ ...reminder, remindAt: new Date("2026-10-26T06:30:00Z") }, siteUrl, UNSUBSCRIBE(siteUrl, "reminders")),
  },
  {
    id: "planner-task",
    name: "Planner notification: assignment due today",
    group: "Planner reminders",
    render: (siteUrl) =>
      reminderMessage({ ...reminder, title: "Chemistry lab report", category: "assignment", subject: "Chemistry", concepts: [], materialTitle: null, time: null, minutes: 60, notes: "Include the titration graph.", remindAt: new Date("2026-10-27T00:00:00Z") }, siteUrl, UNSUBSCRIBE(siteUrl, "reminders")),
  },
  {
    id: "planner-class",
    name: "Planner notification: class in 10 minutes",
    group: "Planner reminders",
    render: (siteUrl) => reminderMessage({ ...reminder, title: "Physics lecture", category: "class", subject: "Physics", concepts: [], materialTitle: null, minutes: 90, remindAt: new Date("2026-10-27T06:20:00Z") }, siteUrl, UNSUBSCRIBE(siteUrl, "reminders")),
  },
  { id: "daily-exam", name: "Daily email: an exam in 3 days", group: "Daily email", render: (siteUrl) => digestMessage("Ana Cruz", day, siteUrl, UNSUBSCRIBE(siteUrl, "digest")) },
  {
    id: "daily-reviews",
    name: "Daily email: reviews due",
    group: "Daily email",
    render: (siteUrl) => digestMessage("Ana Cruz", { ...day, exams: [{ title: "Calculus exam", date: "2026-11-04", daysLeft: 10 }] }, siteUrl, UNSUBSCRIBE(siteUrl, "digest")),
  },
  { id: "daily-plan", name: "Daily email: today's plan", group: "Daily email", render: (siteUrl) => digestMessage("Ana Cruz", { ...day, dueReviews: 0, exams: [] }, siteUrl, UNSUBSCRIBE(siteUrl, "digest")) },
  { id: "welcome", name: "Welcome", group: "Account", render: (siteUrl) => renderEmail(welcomeEmail({ name: "Ana Cruz", link: siteUrl ? `${siteUrl}/dashboard` : null }), siteEmailOptions(siteUrl)) },
  {
    id: "notification",
    name: "General notification",
    group: "Other",
    render: (siteUrl) =>
      renderEmail(
        notificationEmail({
          subject: "Your reviewer is ready",
          icon: "book",
          title: "Your reviewer is ready",
          titleAccent: "ready",
          body: "Biology 2 — Cellular respiration now has a complete reviewer with 12 sections.",
          button: siteUrl ? { label: "Open Reviewer", href: `${siteUrl}/notes` } : null,
        }),
        siteEmailOptions(siteUrl),
      ),
  },
];
