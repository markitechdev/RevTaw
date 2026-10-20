import "server-only";

import { cache } from "react";

import { addDays, dateIn } from "@/lib/planner/dates";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { parseSessionSummary, type SessionSummary } from "@/lib/study/sessions";
import type { StudySession, StudySessionItem } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type SessionListItem = Pick<
  StudySession,
  "id" | "material_id" | "method" | "goal" | "planned_minutes" | "title" | "status" | "focus_seconds" | "items_total" | "items_correct" | "items_incorrect" | "started_at" | "completed_at" | "last_active_at"
> & {
  material: { id: string; title: string } | null;
  summary: SessionSummary | null;
};

const LIST_COLUMNS =
  "id, material_id, method, goal, planned_minutes, title, status, focus_seconds, items_total, items_correct, items_incorrect, started_at, completed_at, last_active_at, summary, material:materials!study_sessions_material_fk(id, title)";

export async function listSessions(filters: { status?: "in_progress" | "completed"; limit?: number } = {}): Promise<SessionListItem[]> {
  const supabase = await createClient();
  let query = supabase.from("study_sessions").select(LIST_COLUMNS).order("last_active_at", { ascending: false }).limit(filters.limit ?? 30);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) {
    console.error("study_sessions: list failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const typed = row as unknown as Omit<SessionListItem, "summary"> & { summary: unknown };
    return { ...typed, summary: parseSessionSummary(typed.summary) };
  });
}

export type SessionItemView = Pick<
  StudySessionItem,
  "id" | "position" | "kind" | "prompt" | "key_points" | "source_excerpt" | "response" | "analysis" | "is_correct" | "score" | "confidence" | "attempts" | "answered_at"
> & {
  concept: { id: string; name: string } | null;
  /** Only present once the item has been answered (never leaked beforehand). */
  model_answer: string | null;
};

export type SessionDetail = StudySession & {
  material: { id: string; title: string } | null;
  items: SessionItemView[];
  parsedSummary: SessionSummary | null;
};

export const getSession = cache(async (sessionId: string): Promise<SessionDetail | null> => {
  const supabase = await createClient();
  const [{ data: session, error }, { data: items }] = await Promise.all([
    supabase.from("study_sessions").select("*, material:materials!study_sessions_material_fk(id, title)").eq("id", sessionId).maybeSingle(),
    supabase
      .from("study_session_items")
      .select("id, position, kind, prompt, model_answer, key_points, source_excerpt, response, analysis, is_correct, score, confidence, attempts, answered_at, concept:concepts!study_session_items_concept_fk(id, name)")
      .eq("session_id", sessionId)
      .order("position"),
  ]);
  if (error) {
    console.error("study_sessions: get failed", error.message);
    return null;
  }
  if (!session) return null;
  const typed = session as unknown as Omit<SessionDetail, "items" | "parsedSummary">;
  return {
    ...typed,
    items: ((items ?? []) as unknown as SessionItemView[]).map((item) => {
      // Hide the model answer and the grading key points until the student has answered (or the session is over).
      const open = Boolean(item.answered_at) || typed.status !== "in_progress";
      return { ...item, model_answer: open ? item.model_answer : null, key_points: open ? item.key_points : [] };
    }),
    parsedSummary: parseSessionSummary(typed.summary),
  };
});

/** The practice-testing session (if any) that owns a quiz attempt. */
export const getSessionForAttempt = cache(async (attemptId: string): Promise<{ id: string; title: string; status: string } | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("study_sessions").select("id, title, status").eq("quiz_attempt_id", attemptId).maybeSingle();
  return data ?? null;
});

export type ActivityStats = {
  streakDays: number;
  focusSecondsToday: number;
  focusSecondsWeek: number;
  sessionsCompleted: number;
  activeDates: string[];
};


/**
 * Streak (consecutive days with a completed session, submitted attempt or
 * flashcard review, ending today or yesterday) and focus time from sessions
 * plus quiz attempt durations.
 */
export const getActivityStats = cache(async (): Promise<ActivityStats> => {
  const supabase = await createClient();
  // Calendar days follow the student's time zone (profiles.timezone; null = UTC).
  const { profile } = await getCurrentUserWithProfile();
  const timezone = profile?.timezone ?? null;
  const dayKey = (value: string) => dateIn(value, timezone);
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [{ data: sessions }, { data: attempts }, { data: reviews }] = await Promise.all([
    supabase.from("study_sessions").select("started_at, completed_at, focus_seconds, status").gte("started_at", since).limit(1000),
    supabase.from("quiz_attempts").select("started_at, submitted_at, time_limit_seconds").eq("status", "submitted").gte("started_at", since).limit(1000),
    supabase.from("flashcard_reviews").select("reviewed_at").gte("reviewed_at", since).limit(2000),
  ]);

  const now = new Date();
  const todayKey = dayKey(now.toISOString());
  const weekStart = addDays(todayKey, -6);
  const days = new Set<string>();
  let focusToday = 0;
  let focusWeek = 0;
  let completed = 0;

  for (const session of sessions ?? []) {
    const key = dayKey(session.started_at);
    if (session.status === "completed" || session.focus_seconds > 0) days.add(session.completed_at ? dayKey(session.completed_at) : key);
    if (session.status === "completed") completed += 1;
    if (key === todayKey) focusToday += session.focus_seconds;
    if (key >= weekStart) focusWeek += session.focus_seconds;
  }
  for (const attempt of attempts ?? []) {
    if (!attempt.submitted_at) continue;
    const key = dayKey(attempt.submitted_at);
    days.add(key);
    const seconds = Math.min(
      attempt.time_limit_seconds ?? 3 * 3600,
      Math.max(0, Math.round((new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 1000)),
    );
    if (key === todayKey) focusToday += seconds;
    if (key >= weekStart) focusWeek += seconds;
  }
  for (const review of reviews ?? []) days.add(dayKey(review.reviewed_at));

  // Count back from today (or yesterday, so an unfinished day does not break the streak).
  let streak = 0;
  let cursor = todayKey;
  if (!days.has(cursor)) cursor = addDays(cursor, -1);
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return { streakDays: streak, focusSecondsToday: focusToday, focusSecondsWeek: focusWeek, sessionsCompleted: completed, activeDates: [...days].sort() };
});
