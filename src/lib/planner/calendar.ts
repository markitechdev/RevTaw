import { addDays, weekdayOf } from "@/lib/planner/dates";

/** Month arithmetic for the planner calendar. Pure and client-safe (unit-tested). */

/** "2026-10" → the dates shown: Sunday before the 1st through Saturday after the last day. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const start = addDays(first, -weekdayOf(first));
  const next = addDays(first, 32).slice(0, 7);
  const last = addDays(`${next}-01`, -1);
  const end = addDays(last, 6 - weekdayOf(last));
  const weeks: string[][] = [];
  for (let day = start; day <= end; day = addDays(day, 7)) weeks.push(Array.from({ length: 7 }, (_, index) => addDays(day, index)));
  return weeks;
}

export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + delta;
  const shifted = new Date(Date.UTC(year, index, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}
