/**
 * Calendar helpers for the planner. Dates are ISO `YYYY-MM-DD` strings in the
 * student's time zone; arithmetic is done in UTC on those strings so it never
 * depends on the server's zone.
 */

export const DEFAULT_TIMEZONE = "UTC";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Whether `Intl` knows the zone; unknown zones fall back to UTC everywhere. */
export function isValidTimezone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date of an instant in a time zone. */
export function dateIn(instant: Date | string | number, timezone: string | null | undefined): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  const zone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Local hour (0-23) of an instant in a time zone. */
export function hourIn(instant: Date, timezone: string | null | undefined): number {
  const zone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).formatToParts(instant).find((part) => part.type === "hour")?.value;
  return Number(hour ?? 0);
}

export function todayIn(timezone: string | null | undefined, now: Date = new Date()): string {
  return dateIn(now, timezone);
}

export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10))) - Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)))) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday, like `Date#getDay`. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Monday-based start of the week containing `date`. */
export function weekStartOf(date: string): string {
  const weekday = weekdayOf(date);
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** "Mon, 3 Nov" style label without the year (or with it when it differs from today's). */
export function formatDate(date: string, today?: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  const sameYear = today ? today.slice(0, 4) === date.slice(0, 4) : true;
  return parsed.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "Today", "Tomorrow", "In 5 days", "3 days ago". */
export function relativeDays(date: string, today: string): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${-diff} days ago`;
}
