import { addDays, dateIn, formatDate } from "@/lib/planner/dates";
import { formatClock, zonedInstant } from "@/lib/planner/time";
import type { TaskReminder } from "@/lib/supabase/database.types";

/**
 * Reminder timing (UI phase §27): an activity happens at a local wall time
 * in the student's time zone; its reminder is an absolute instant computed
 * from that. Activities without a time are "any time that day" and are
 * reminded relative to 8:00 AM. Pure and client-safe (unit-tested).
 */

export const ALL_DAY_REMINDER_TIME = "08:00";

/** Longest custom reminder: two weeks before. */
export const MAX_REMINDER_MINUTES = 20_160;

/** Minutes before the start, or null when there is no reminder. */
export function reminderOffsetMinutes(reminder: TaskReminder, customMinutes: number | null): number | null {
  switch (reminder) {
    case "none":
      return null;
    case "at_time":
      return 0;
    case "10m":
      return 10;
    case "30m":
      return 30;
    case "1h":
      return 60;
    case "1d":
      return 1440;
    case "custom":
      return customMinutes === null ? null : Math.max(0, Math.min(MAX_REMINDER_MINUTES, Math.round(customMinutes)));
  }
}

/** When to remind: the start (8:00 AM for an all-day activity) minus the offset; null for no reminder. */
export function remindAtFor(input: { date: string; time: string | null; reminder: TaskReminder; reminderMinutes: number | null; timeZone: string | null }): Date | null {
  const offset = reminderOffsetMinutes(input.reminder, input.reminderMinutes);
  if (offset === null) return null;
  const start = zonedInstant(input.date, input.time ?? ALL_DAY_REMINDER_TIME, input.timeZone);
  return new Date(start.getTime() - offset * 60_000);
}

/** "2 hours", "45 minutes", "3 days" for a custom reminder. */
export function durationPhrase(minutes: number): string {
  if (minutes % 1440 === 0 && minutes >= 1440) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0 && minutes >= 60) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** The reminder setting in words: "30 minutes before", "At the time", "2 hours before". */
export function reminderLabel(reminder: TaskReminder, customMinutes: number | null): string {
  const minutes = reminderOffsetMinutes(reminder, customMinutes);
  if (minutes === null) return "No reminder";
  if (minutes === 0) return "At the time";
  return `${durationPhrase(minutes)} before`;
}

/** How a reminder sent at `remindAt` describes the start: "now", "in 30 minutes", "tomorrow at 8:00 AM", "today". */
export function startPhrase(input: { date: string; time: string | null; remindAt: Date; timeZone: string | null }): string {
  const remindDay = dateIn(input.remindAt, input.timeZone);
  const day = input.date === remindDay ? "today" : input.date === addDays(remindDay, 1) ? "tomorrow" : formatDate(input.date, remindDay);
  if (!input.time) return day === "today" || day === "tomorrow" ? day : `on ${day}`;
  const minutes = Math.round((zonedInstant(input.date, input.time, input.timeZone).getTime() - input.remindAt.getTime()) / 60_000);
  if (minutes <= 1) return "now";
  if (minutes < 60) return `in ${minutes} minutes`;
  if (minutes < 180 && minutes % 60 === 0) return `in ${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${day === "today" || day === "tomorrow" ? day : `on ${day}`} at ${formatClock(input.time)}`;
}
