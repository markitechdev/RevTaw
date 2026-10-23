/**
 * How long the Archive keeps a deleted material before its file, extracted
 * text and analysis are deleted permanently. Pure and client-safe; the purge
 * itself is in `purge.ts`.
 */

export const ARCHIVE_DAYS = 30;

/** What stays when a file goes, said the same way everywhere. */
export const KEPT_ITEMS = "Reviewers, quizzes, flashcards, memory aids and progress";

/** What the Archive does, in one line (the Delete dialog and the Archive page). */
export const ARCHIVE_RULE = `Deleted materials wait in the Archive for ${ARCHIVE_DAYS} days, so you can restore them. After that, the file, its extracted text and its analysis are deleted permanently.`;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When an archived material is deleted permanently. */
export function purgeDueAt(archivedAt: string | Date): Date {
  return new Date(new Date(archivedAt).getTime() + ARCHIVE_DAYS * DAY_MS);
}

/** Archived on or before this instant means due for permanent deletion. */
export function archiveCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - ARCHIVE_DAYS * DAY_MS);
}

/** Whole days left before permanent deletion, rounded up (0 once it is due). */
export function daysUntilPurge(archivedAt: string | Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((purgeDueAt(archivedAt).getTime() - now.getTime()) / DAY_MS));
}

/** "in 12 days", "tomorrow", "today": when the Archive lets go of it. */
export function purgeCountdown(archivedAt: string | Date, now: Date = new Date()): string {
  const days = daysUntilPurge(archivedAt, now);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** "Nov 22, 2026": a day in the student's time zone (the purge day, or when a file was deleted). */
export function dayLabel(value: string | Date, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  try {
    return new Date(value).toLocaleDateString("en-US", timeZone ? { ...options, timeZone } : options);
  } catch {
    // An unknown time zone name: fall back to the server's.
    return new Date(value).toLocaleDateString("en-US", options);
  }
}
