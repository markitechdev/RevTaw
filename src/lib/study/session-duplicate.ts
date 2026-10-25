import { routes } from "@/lib/routes";

/**
 * What the server answers instead of starting a session when the student already has an unfinished one like
 * it (see `checkSessionStart` in duplicates.ts). Shared with the browser, which shows the warning: only the
 * newest copy's id, title, start time and link, and how many copies there are.
 */
export type SessionDuplicate = {
  duplicate: true;
  /** Unfinished sessions like the one asked for. */
  duplicateCount: number;
  /** "warning": one copy; "strong": several; "limit": as many as RevTaw allows, so no new one starts. */
  level: "warning" | "strong" | "limit";
  /** The copy the student worked on last. */
  existingItem: { id: string; title: string; startedAt: string; href: string };
};

export function isSessionDuplicate(value: unknown): value is SessionDuplicate {
  return typeof value === "object" && value !== null && (value as { duplicate?: unknown }).duplicate === true;
}

/** Study's list of unfinished sessions ("Continue where you left off"). */
export const UNFINISHED_SESSIONS_ID = "unfinished-sessions";
export const UNFINISHED_SESSIONS_HREF = `${routes.study}#${UNFINISHED_SESSIONS_ID}`;
