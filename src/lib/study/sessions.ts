import "server-only";

import { z } from "zod";

import { STUDY_METHOD_BY_ID, type StudyMethodId } from "@/lib/study/methods";
import type { Json, SessionGoal, StudySession } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export class SessionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

export const SESSION_GOALS: ReadonlyArray<{ id: SessionGoal; label: string; hint: string }> = [
  { id: "memorize", label: "Memorize", hint: "Definitions, terms, facts" },
  { id: "understand", label: "Understand", hint: "Explain ideas in your own words" },
  { id: "practice", label: "Practice", hint: "Answer questions and get feedback" },
  { id: "exam_prep", label: "Exam preparation", hint: "Simulate test conditions" },
  { id: "quick_review", label: "Quick review", hint: "A short refresher" },
  { id: "master_topic", label: "Master topic", hint: "Push weak concepts to strong" },
];

export const SESSION_GOAL_LABEL: Record<SessionGoal, string> = Object.fromEntries(
  SESSION_GOALS.map((goal) => [goal.id, goal.label]),
) as Record<SessionGoal, string>;

/** Summary shape stored in `study_sessions.summary` (§29). */
export const sessionSummarySchema = z.object({
  durationSeconds: z.number().int().min(0),
  topics: z.array(z.string()).max(30),
  questionsAnswered: z.number().int().min(0),
  correct: z.number().int().min(0),
  incorrect: z.number().int().min(0),
  accuracy: z.number().min(0).max(1).nullable(),
  improvement: z.number().min(-1).max(1).nullable(),
  weakConcepts: z.array(z.string()).max(20),
  strongConcepts: z.array(z.string()).max(20),
  masteredConcepts: z.array(z.string()).max(20),
  suggestedNext: z.string().max(300),
  nextReviewAt: z.string().nullable(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export function parseSessionSummary(value: unknown): SessionSummary | null {
  const parsed = sessionSummarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type CreateSessionInput = {
  method: StudyMethodId;
  materialId: string | null;
  subjectId?: string | null;
  goal: SessionGoal | null;
  plannedMinutes: number | null;
  title: string;
  state?: Record<string, unknown>;
};

export async function createSession(supabase: Client, userId: string, input: CreateSessionInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("study_sessions")
    .insert({
      user_id: userId,
      material_id: input.materialId,
      subject_id: input.subjectId ?? null,
      method: input.method,
      goal: input.goal,
      planned_minutes: input.plannedMinutes,
      title: input.title.slice(0, 160),
      state: (input.state ?? {}) as Json,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`study_sessions: insert failed: ${error?.message}`);
  return { id: data.id };
}

export async function loadSession(supabase: Client, sessionId: string): Promise<StudySession> {
  const { data } = await supabase.from("study_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!data) throw new SessionError("Session not found.", 404);
  return data;
}

/** Merges progress into `state` and bumps `last_active_at` (keeps refresh-safe progress, §53). */
export async function updateSessionState(
  supabase: Client,
  sessionId: string,
  patch: Record<string, unknown>,
  counters?: { focusSeconds?: number },
): Promise<void> {
  const session = await loadSession(supabase, sessionId);
  if (session.status !== "in_progress") throw new SessionError("This session is already finished.", 409);
  const state = { ...((session.state as Record<string, unknown> | null) ?? {}), ...patch };
  const { error } = await supabase
    .from("study_sessions")
    .update({
      state: state as Json,
      last_active_at: new Date().toISOString(),
      ...(counters?.focusSeconds !== undefined ? { focus_seconds: Math.max(session.focus_seconds, Math.min(86_400, Math.round(counters.focusSeconds))) } : {}),
    })
    .eq("id", sessionId);
  if (error) throw new Error(`study_sessions: update failed: ${error.message}`);
}

/** Previous completed session of the same method and material, for the "improvement" figure. */
async function previousAccuracy(supabase: Client, session: StudySession): Promise<number | null> {
  let query = supabase
    .from("study_sessions")
    .select("summary")
    .eq("method", session.method)
    .eq("status", "completed")
    .neq("id", session.id)
    .order("completed_at", { ascending: false })
    .limit(1);
  query = session.material_id ? query.eq("material_id", session.material_id) : query.is("material_id", null);
  const { data } = await query.maybeSingle();
  const summary = data ? parseSessionSummary(data.summary) : null;
  return summary?.accuracy ?? null;
}

export type CompleteSessionInput = {
  focusSeconds?: number;
  topics: string[];
  questionsAnswered: number;
  correct: number;
  incorrect: number;
  weakConcepts: string[];
  strongConcepts: string[];
  masteredConcepts?: string[];
  suggestedNext: string;
  nextReviewAt: string | null;
  extra?: Record<string, unknown>;
  abandoned?: boolean;
};

/** Stores the summary and marks the session completed. Idempotent. */
export async function completeSession(supabase: Client, sessionId: string, input: CompleteSessionInput): Promise<SessionSummary> {
  const session = await loadSession(supabase, sessionId);
  if (session.status !== "in_progress") {
    const existing = parseSessionSummary(session.summary);
    if (existing) return existing;
  }
  const now = new Date();
  const elapsed = Math.round((now.getTime() - new Date(session.started_at).getTime()) / 1000);
  const focusSeconds = Math.max(session.focus_seconds, Math.min(elapsed, Math.round(input.focusSeconds ?? elapsed)));
  const accuracy = input.questionsAnswered > 0 ? input.correct / input.questionsAnswered : null;
  const previous = await previousAccuracy(supabase, session);
  const summary: SessionSummary = {
    durationSeconds: focusSeconds,
    topics: input.topics.slice(0, 30),
    questionsAnswered: input.questionsAnswered,
    correct: input.correct,
    incorrect: input.incorrect,
    accuracy,
    improvement: accuracy !== null && previous !== null ? Math.round((accuracy - previous) * 100) / 100 : null,
    weakConcepts: input.weakConcepts.slice(0, 20),
    strongConcepts: input.strongConcepts.slice(0, 20),
    masteredConcepts: (input.masteredConcepts ?? []).slice(0, 20),
    suggestedNext: input.suggestedNext.slice(0, 300),
    nextReviewAt: input.nextReviewAt,
    extra: input.extra,
  };
  const { error } = await supabase
    .from("study_sessions")
    .update({
      status: input.abandoned ? "abandoned" : "completed",
      summary: summary as unknown as Json,
      focus_seconds: focusSeconds,
      items_total: input.questionsAnswered,
      items_correct: input.correct,
      items_incorrect: input.incorrect,
      completed_at: now.toISOString(),
      last_active_at: now.toISOString(),
    })
    .eq("id", sessionId)
    .eq("status", "in_progress");
  if (error) throw new Error(`study_sessions: complete failed: ${error.message}`);
  return summary;
}

export function sessionTitle(method: StudyMethodId, materialTitle: string | null): string {
  const name = STUDY_METHOD_BY_ID[method].name;
  return materialTitle ? `${materialTitle} — ${name}` : name;
}

/** Suggests the next activity from how the session went (§29). */
export function suggestNext(accuracy: number | null, weakConcepts: string[], method: StudyMethodId): string {
  const weak = weakConcepts[0];
  if (accuracy === null) return "Take a short quiz on this material so RevTaw can start tracking concepts.";
  if (accuracy < 0.5) return weak ? `Re-read the section on ${weak}, then try a Feynman session to explain it in your own words.` : "Re-read the material's reviewer, then repeat this session.";
  if (accuracy < 0.8) return weak ? `Run an Active Recall session focused on ${weak} before the next quiz.` : "Repeat this session tomorrow to move these concepts into long-term memory.";
  return method === "practice_testing" ? "Strong result — schedule an exam simulation in a few days to confirm it holds." : "Strong recall — switch to practice testing to check it under exam conditions.";
}
