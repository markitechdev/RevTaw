/**
 * Calendar helpers for the planner. Dates are ISO `YYYY-MM-DD` strings in the
 * student's time zone; arithmetic is done in UTC on those strings so it never
 * depends on the server's zone.
 */

/**
 * RevTaw's home time zone: "today" for a student whose browser has not told RevTaw theirs yet (the app
 * stores it on the first visit), and the day the daily AI limits reset on. The SQL functions in migrations
 * 0016 and 0021 count AI usage in the same zone. Manila has no daylight saving time.
 */
export const DEFAULT_TIMEZONE = "Asia/Manila";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/*
 * Creating an Intl.DateTimeFormat costs far more than using one (about
 * 0.1 ms each, and the learning engine converts thousands of dates per
 * student), so formatters are made once per time zone and kept.
 */
const MAX_CACHED_ZONES = 500;
const zoneValidity = new Map<string, boolean>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const hourFormatters = new Map<string, Intl.DateTimeFormat>();

function cached<T>(cache: Map<string, T>, key: string, make: () => T): T {
  let value = cache.get(key);
  if (value === undefined) {
    if (cache.size >= MAX_CACHED_ZONES) cache.clear();
    value = make();
    cache.set(key, value);
  }
  return value;
}

/** Whether `Intl` knows the zone; unknown zones fall back to UTC everywhere. */
export function isValidTimezone(value: string | null | undefined): value is string {
  if (!value) return false;
  return cached(zoneValidity, value, () => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });
}

/** The calendar date of an instant in a time zone. */
export function dateIn(instant: Date | string | number, timezone: string | null | undefined): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  const zone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const formatter = cached(dateFormatters, zone, () => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }));
  let year = "0000";
  let month = "00";
  let day = "00";
  for (const part of formatter.formatToParts(date)) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  return `${year}-${month}-${day}`;
}

/** Local hour (0-23) of an instant in a time zone. */
export function hourIn(instant: Date, timezone: string | null | undefined): number {
  const zone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const formatter = cached(hourFormatters, zone, () => new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }));
  const hour = formatter.formatToParts(instant).find((part) => part.type === "hour")?.value;
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
