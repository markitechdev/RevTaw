/**
 * Focus time, counted once wherever RevTaw adds it up (Home, Progress, goals,
 * badges and XP).
 *
 * - Smart Study, routines and pre-testing run each block as a child session
 *   and give the parent the children's total: only the children count.
 * - Practice tests and pre-tests record their quiz attempt's time on their
 *   session: such an attempt does not count again on its own.
 */

/** The longest gap between two things the student did that still counts as studying; a longer one was a break. */
export const IDLE_GAP_SECONDS = 30 * 60;

/**
 * Seconds a session was studied: from its start to each answer or message and on to the end, each gap
 * counted up to IDLE_GAP_SECONDS. A session left open overnight and finished the next day counts the work,
 * not the night.
 */
export function activeSeconds(startedAt: string, activity: ReadonlyArray<string | null | undefined>, end: Date = new Date()): number {
  const start = new Date(startedAt).getTime();
  const times = activity
    .map((at) => (at ? new Date(at).getTime() : Number.NaN))
    .filter((time) => Number.isFinite(time) && time >= start && time <= end.getTime())
    .sort((a, b) => a - b);
  let total = 0;
  let previous = start;
  for (const time of [...times, end.getTime()]) {
    total += Math.min(IDLE_GAP_SECONDS, Math.max(0, (time - previous) / 1000));
    previous = time;
  }
  return Math.round(total);
}

/** Sessions that only hold a plan of child sessions. */
export const PLAN_PARENT_METHODS: ReadonlySet<string> = new Set(["smart_study", "custom_routine", "pre_testing"]);

/** The focus time a session adds: none for a plan's parent, whose children carry it. */
export function sessionFocusSeconds(session: { method: string; focus_seconds: number }): number {
  return PLAN_PARENT_METHODS.has(session.method) ? 0 : session.focus_seconds;
}

/** The quiz attempts whose time a study session already carries. */
export function sessionLinkedAttempts(sessions: Array<{ quiz_attempt_id: string | null }>): Set<string> {
  return new Set(sessions.map((session) => session.quiz_attempt_id).filter((id): id is string => Boolean(id)));
}

/** A submitted attempt's own time, capped by its limit (or three hours). */
export function attemptFocusSeconds(attempt: { started_at: string; submitted_at: string | null; time_limit_seconds: number | null }): number {
  if (!attempt.submitted_at) return 0;
  const seconds = Math.round((new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 1000);
  return Math.min(attempt.time_limit_seconds ?? 3 * 3600, Math.max(0, seconds));
}
