import "server-only";

import { createHash } from "node:crypto";

import type { GoogleEvent } from "@/lib/calendar/google";
import { addDays } from "@/lib/planner/dates";
import { shortTime } from "@/lib/planner/time";
import { reminderOffsetMinutes } from "@/lib/reminders/time";
import { routes } from "@/lib/routes";
import type { TaskReminder, TaskStatus } from "@/lib/supabase/database.types";

/**
 * What RevTaw writes to the "RevTaw Study" calendar. Every planner activity
 * and exam has a fixed event id derived from its own id (Google accepts
 * lowercase a–v and digits, which covers a UUID's hex), so writes are
 * idempotent and no mapping table is needed. A hash of the content is kept
 * in the event's private properties, so a sync only rewrites what changed.
 */

export type CalendarTask = {
  id: string;
  title: string;
  scheduled_for: string;
  starts_at: string | null;
  minutes: number;
  status: TaskStatus;
  notes: string | null;
  reminder: TaskReminder;
  reminder_minutes: number | null;
};

export type CalendarExam = { id: string; title: string; exam_date: string; notes: string | null };

const clip = (value: string, length: number) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

export function taskEventId(taskId: string): string {
  return `ta${taskId.replace(/-/g, "").toLowerCase()}`;
}

export function examEventId(examId: string): string {
  return `ea${examId.replace(/-/g, "").toLowerCase()}`;
}

/** Adds minutes to a local wall time, moving to the next day past midnight. */
export function addLocalMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const [hours, mins] = shortTime(time).split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  const days = Math.floor(total / 1440);
  const rest = total - days * 1440;
  return { date: addDays(date, days), time: `${String(Math.floor(rest / 60)).padStart(2, "0")}:${String(rest % 60).padStart(2, "0")}` };
}

function sealed(event: Omit<GoogleEvent, "extendedProperties">, kind: "task" | "exam"): GoogleEvent {
  const hash = createHash("sha256").update(JSON.stringify(event)).digest("base64url").slice(0, 22);
  return { ...event, extendedProperties: { private: { revtaw: kind, hash } } };
}

export function taskEvent(task: CalendarTask, options: { timeZone: string; siteUrl: string }): GoogleEvent {
  const link = `${options.siteUrl.replace(/\/+$/, "")}${routes.planner}?date=${task.scheduled_for}`;
  const done = task.status === "done";
  const notes = task.notes?.replace(/\s+/g, " ").trim();
  const timed = task.starts_at !== null;
  const offset = timed ? reminderOffsetMinutes(task.reminder, task.reminder_minutes) : null;
  const end = timed ? addLocalMinutes(task.scheduled_for, task.starts_at!, task.minutes) : null;
  return sealed(
    {
      id: taskEventId(task.id),
      summary: clip(`${done ? "✓ " : ""}${task.title}`, 200),
      description: [`${task.minutes} min, planned in RevTaw.`, notes ? clip(notes, 600) : null, `Open in RevTaw: ${link}`].filter(Boolean).join("\n\n"),
      start: timed ? { dateTime: `${task.scheduled_for}T${shortTime(task.starts_at!)}:00`, timeZone: options.timeZone } : { date: task.scheduled_for },
      end: timed ? { dateTime: `${end!.date}T${end!.time}:00`, timeZone: options.timeZone } : { date: addDays(task.scheduled_for, 1) },
      // The activity's own reminder becomes a phone notification from Google (timed activities; finished ones stay quiet).
      reminders: { useDefault: false, overrides: offset !== null && !done ? [{ method: "popup", minutes: Math.min(offset, 40_320) }] : [] },
      source: { title: "RevTaw", url: link },
      status: "confirmed",
    },
    "task",
  );
}

export function examEvent(exam: CalendarExam, options: { siteUrl: string }): GoogleEvent {
  const link = `${options.siteUrl.replace(/\/+$/, "")}${routes.planner}/${exam.id}`;
  const notes = exam.notes?.replace(/\s+/g, " ").trim();
  return sealed(
    {
      id: examEventId(exam.id),
      summary: clip(`Exam: ${exam.title}`, 200),
      description: [notes ? clip(notes, 600) : null, `Your study plan in RevTaw: ${link}`].filter(Boolean).join("\n\n"),
      start: { date: exam.exam_date },
      end: { date: addDays(exam.exam_date, 1) },
      // 9 a.m. the day before (all-day events count back from midnight).
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 15 * 60 }] },
      source: { title: "RevTaw", url: link },
      status: "confirmed",
    },
    "exam",
  );
}
