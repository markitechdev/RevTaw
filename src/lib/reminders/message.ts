import { routes } from "@/lib/routes";
import { startPhrase } from "@/lib/reminders/time";

/**
 * What a reminder says, on every channel: the bell, the browser and email
 * (UI phase §27–§29). Pure (unit-tested); the email HTML escapes everything
 * that comes from the student.
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
};

export type ReminderMessage = { title: string; body: string; href: string; subject: string; text: string; html: string };

const clip = (value: string, length: number) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

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

export function reminderMessage(content: ReminderContent, siteUrl: string | null): ReminderMessage {
  const name = clip(content.title.replace(/\s+/g, " ").trim(), 140);
  const when = whenLine(content);
  const details = [when, `${content.minutes} min`, content.materialTitle ? clip(content.materialTitle, 80) : null].filter(Boolean).join(" · ");
  const notes = content.notes?.replace(/\s+/g, " ").trim() ? clip(content.notes.replace(/\s+/g, " ").trim(), 300) : null;
  const href = `${routes.planner}?date=${content.date}`;
  const link = siteUrl ? `${siteUrl.replace(/\/+$/, "")}${href}` : null;
  const subject = clip(`Reminder: ${name} — ${when.charAt(0).toLowerCase()}${when.slice(1)}`, 160);
  const text = [`${name}`, details, notes ? `Notes: ${notes}` : null, link ? `Open your planner: ${link}` : null, "", "You get this email because email reminders are on in RevTaw → Settings → Notifications."].filter((line) => line !== null).join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f6fb;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1b1530">
<div style="max-width:480px;margin:0 auto;padding:24px">
<p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6d3fdc">RevTaw reminder</p>
<h1 style="margin:0 0 8px;font-size:20px;line-height:1.3">${escapeHtml(name)}</h1>
<p style="margin:0 0 16px;font-size:15px;color:#4b4563">${escapeHtml(details)}</p>
${notes ? `<p style="margin:0 0 16px;font-size:14px;color:#4b4563">${escapeHtml(notes)}</p>` : ""}
${link ? `<p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#6d3fdc;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:10px">Open my planner</a></p>` : ""}
<p style="margin:0;font-size:12px;color:#77708f">You get this email because email reminders are on in RevTaw → Settings → Notifications.</p>
</div></body></html>`;
  return { title: clip(`Reminder: ${name}`, 160), body: clip(notes ? `${details}. ${notes}` : details, 600), href, subject, text, html };
}
