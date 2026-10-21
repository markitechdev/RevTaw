import { DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/planner/dates";

/**
 * Clock times for planner activities: a local wall time ("14:30") in the
 * student's time zone. Pure and client-safe (unit-tested).
 */

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export function isClockTime(value: string): boolean {
  return TIME.test(value);
}

/** "14:30:00" → "14:30". */
export function shortTime(value: string): string {
  return value.slice(0, 5);
}

/** "14:30" → "2:30 PM". */
export function formatClock(time: string): string {
  const [hours, minutes] = shortTime(time).split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** How far (in minutes) the zone's clock is ahead of UTC at an instant. */
function zoneOffsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Math.round((Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant) / 60_000);
}

/** The instant a local date and time happen in a time zone (unknown zones count as UTC). */
export function zonedInstant(date: string, time: string, timeZone: string | null | undefined): Date {
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const [hours, minutes] = shortTime(time).split(":").map(Number);
  const wall = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hours, minutes);
  let instant = wall - zoneOffsetMinutes(wall, zone) * 60_000;
  // A second pass settles daylight-saving changes between the guess and the answer.
  const corrected = wall - zoneOffsetMinutes(instant, zone) * 60_000;
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}
