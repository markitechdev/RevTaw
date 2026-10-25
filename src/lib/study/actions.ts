"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { completeSmartSession, getSmartSessionView, markSmartBlock, parseSmartPlan } from "@/lib/adaptive/smart";
import { track } from "@/lib/analytics/server";
import { routes } from "@/lib/routes";
import { actionFailure, revalidateStudy, uuid, type StudyActionResult } from "@/lib/study/action-helpers";
import { compareBlurtItem, evaluateQuestionItem, type BlurtResult, type EvaluatedQuestion } from "@/lib/study/advanced";
import { BUILDER_METHOD_IDS } from "@/lib/study/catalog";
import { PROBLEM_DIFFICULTIES } from "@/lib/study/problem-options";
import { completePreTesting } from "@/lib/study/flows/pretest";
import { deleteRoutine, saveRoutine, startRoutine, type RoutineFormInput } from "@/lib/study/routines";
import {
  analyzeFeynmanItem,
  answerRecallItem,
  completeItemSession,
  completePomodoro,
  savePomodoro,
  startPlannedSession,
  startSession,
  type FeynmanRoundResult,
  type RecallItemResult,
  type StartSessionResult,
} from "@/lib/study/service";
import { isSessionDuplicate, type SessionDuplicate } from "@/lib/study/session-duplicate";
import { loadSession, type SessionSummary } from "@/lib/study/sessions";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type { StudyActionResult } from "@/lib/study/action-helpers";

const revalidate = revalidateStudy;
const failure = actionFailure;

const startSchema = z.object({
  method: z.enum(BUILDER_METHOD_IDS),
  materialId: uuid.nullable(),
  materialIds: z.array(uuid).max(4).optional(),
  goal: z.enum(["memorize", "understand", "practice", "exam_prep", "quick_review", "master_topic"]).nullable(),
  plannedMinutes: z.number().int().min(1).max(480),
  questionCount: z.number().int().min(3).max(50).optional(),
  timed: z.boolean().optional(),
  /** Practice testing: the topic or chapter to stay on ("quiz me about Chapter 4"). */
  focus: z.string().trim().max(400).nullable().optional(),
  /** Active recall and Feynman: the concepts to ask about first (Tamari's "explain Binary Trees to me"). */
  focusConcepts: z.array(z.string().trim().min(1).max(120)).max(6).optional(),
  problemDifficulty: z.enum(["adaptive", ...PROBLEM_DIFFICULTIES]).optional(),
  freshVisuals: z.boolean().optional(),
  freshMap: z.boolean().optional(),
  savedMnemonics: z.boolean().optional(),
  workMinutes: z.number().int().min(1).max(120).optional(),
  breakMinutes: z.number().int().min(1).max(60).optional(),
  topic: z.string().trim().max(120).nullable().optional(),
  /** The student saw the warning about an unfinished session like this one and chose to start another. */
  allowDuplicate: z.boolean().optional(),
});

/** Starts a session, or answers with the unfinished one like it (`duplicate: true`) without starting anything. */
export async function startSessionAction(input: z.input<typeof startSchema>): Promise<StudyActionResult<StartSessionResult | SessionDuplicate>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the session settings." };
  try {
    const result = await startSession(user.id, parsed.data);
    if (!isSessionDuplicate(result)) revalidate();
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "The session could not be started. Please try again.");
  }
}

export async function answerRecallAction(input: { itemId: string; response: string; confidence: "guessing" | "unsure" | "somewhat_confident" | "very_confident" | null; responseMs: number | null }): Promise<StudyActionResult<RecallItemResult>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z
    .object({
      itemId: uuid,
      response: z.string().max(8000),
      confidence: z.enum(["guessing", "unsure", "somewhat_confident", "very_confident"]).nullable(),
      responseMs: z.number().int().min(0).max(86_400_000).nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "That answer could not be saved." };
  try {
    const result = await answerRecallItem(parsed.data);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "Your answer could not be checked. Please try again.");
  }
}

export async function saveRoutineAction(input: RoutineFormInput, routineId: string | null): Promise<StudyActionResult<{ routineId: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (routineId && !uuid.safeParse(routineId).success) return { ok: false, message: "Invalid routine." };
  try {
    const data = await saveRoutine(input, routineId);
    revalidate();
    return { ok: true, data };
  } catch (error) {
    return failure(error, "The routine could not be saved.");
  }
}

export async function deleteRoutineAction(routineId: string): Promise<StudyActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(routineId).success) return { ok: false, message: "Invalid routine." };
  try {
    await deleteRoutine(routineId);
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error, "The routine could not be deleted.");
  }
}

export async function startRoutineAction(input: { routineId: string; materialId: string | null; allowDuplicate?: boolean }): Promise<StudyActionResult<{ redirect: string } | SessionDuplicate>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ routineId: uuid, materialId: uuid.nullable(), allowDuplicate: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid routine." };
  try {
    const result = await startRoutine(user.id, parsed.data.routineId, { materialId: parsed.data.materialId, goal: null, allowDuplicate: Boolean(parsed.data.allowDuplicate) });
    if (isSessionDuplicate(result)) return { ok: true, data: result };
    revalidate(result.sessionId);
    return { ok: true, data: { redirect: `${routes.study}/${result.sessionId}` } };
  } catch (error) {
    return failure(error, "The routine could not be started.");
  }
}

export async function compareBlurtAction(input: { itemId: string; text: string; responseMs: number | null }): Promise<StudyActionResult<BlurtResult>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ itemId: uuid, text: z.string().max(8000), responseMs: z.number().int().min(0).max(86_400_000).nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid blurt." };
  try {
    const data = await compareBlurtItem(parsed.data);
    return { ok: true, data };
  } catch (error) {
    return failure(error, "Your text could not be compared.");
  }
}

export async function evaluateQuestionAction(input: { sessionId: string; question: string; expectedAnswer: string | null; responseMs: number | null }): Promise<StudyActionResult<EvaluatedQuestion>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ sessionId: uuid, question: z.string().trim().min(5, "Write a full question.").max(1000), expectedAnswer: z.string().trim().max(2000).nullable(), responseMs: z.number().int().min(0).max(86_400_000).nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid question." };
  try {
    const data = await evaluateQuestionItem({ ...parsed.data, expectedAnswer: parsed.data.expectedAnswer || null });
    revalidate(parsed.data.sessionId);
    return { ok: true, data };
  } catch (error) {
    return failure(error, "The question could not be evaluated.");
  }
}

export async function analyzeFeynmanAction(input: { itemId: string; explanation: string; responseMs: number | null }): Promise<StudyActionResult<FeynmanRoundResult>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ itemId: uuid, explanation: z.string().max(8000), responseMs: z.number().int().min(0).max(86_400_000).nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That explanation could not be saved." };
  try {
    const result = await analyzeFeynmanItem(parsed.data);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "Your explanation could not be analyzed. Please try again.");
  }
}

export async function completeSessionAction(input: { sessionId: string; focusSeconds: number | null; abandoned?: boolean }): Promise<StudyActionResult<SessionSummary>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ sessionId: uuid, focusSeconds: z.number().int().min(0).max(86_400).nullable(), abandoned: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid session." };
  try {
    const summary = await completeItemSession(parsed.data.sessionId, parsed.data.focusSeconds, parsed.data.abandoned);
    revalidate(parsed.data.sessionId);
    if (!parsed.data.abandoned) track(user.id, "study_session_completed", { minutes: Math.round(summary.durationSeconds / 60), questions: summary.questionsAnswered });
    return { ok: true, data: summary };
  } catch (error) {
    return failure(error, "The session could not be saved.");
  }
}

const pomodoroStateSchema = z.object({
  phase: z.enum(["idle", "work", "break", "long_break", "paused"]),
  pausedPhase: z.enum(["work", "break", "long_break"]).nullable(),
  phaseEndsAt: z.string().nullable(),
  pausedRemainingSeconds: z.number().int().min(0).max(14_400).nullable(),
  completedRounds: z.number().int().min(0).max(100),
  focusSeconds: z.number().int().min(0).max(86_400),
});

export async function savePomodoroAction(input: { sessionId: string; state: z.input<typeof pomodoroStateSchema> }): Promise<StudyActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ sessionId: uuid, state: pomodoroStateSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid timer state." };
  try {
    await savePomodoro(parsed.data.sessionId, parsed.data.state, parsed.data.state.focusSeconds);
    return { ok: true };
  } catch (error) {
    return failure(error, "The timer could not be saved.");
  }
}

export async function completePomodoroAction(input: { sessionId: string; focusSeconds: number; completedRounds: number }): Promise<StudyActionResult<SessionSummary>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ sessionId: uuid, focusSeconds: z.number().int().min(0).max(86_400), completedRounds: z.number().int().min(0).max(100) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid session." };
  try {
    const summary = await completePomodoro(parsed.data.sessionId, parsed.data.focusSeconds, parsed.data.completedRounds);
    revalidate(parsed.data.sessionId);
    return { ok: true, data: summary };
  } catch (error) {
    return failure(error, "The session could not be saved.");
  }
}

/** Starts (or resumes) one block of a smart session as its own child session. */
export async function startSmartBlockAction(input: { sessionId: string; key: string }): Promise<StudyActionResult<{ redirect: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ sessionId: uuid, key: z.string().min(1).max(40) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid block." };
  try {
    const supabase = await createClient();
    const session = await loadSession(supabase, parsed.data.sessionId);
    if (session.status !== "in_progress") return { ok: false, message: "This plan has already ended." };
    const plan = parseSmartPlan(session.state);
    const block = plan?.blocks.find((item) => item.key === parsed.data.key);
    if (!plan || !block) return { ok: false, message: "That block no longer exists." };
    if (block.childSessionId) {
      const child = await loadSession(supabase, block.childSessionId).catch(() => null);
      if (child?.status === "in_progress") return { ok: true, data: { redirect: `${routes.study}/${child.id}` } };
    }
    if (block.method === "spaced_repetition") {
      await markSmartBlock(session.id, block.key, { status: "in_progress" });
      revalidate(session.id);
      return { ok: true, data: { redirect: `${routes.flashcards}/review` } };
    }
    // A plan's last retest stays on what the earlier blocks missed today, when they missed anything.
    let focus = block.focus ?? null;
    if (block.key === "retest") {
      const view = await getSmartSessionView(session.id);
      const missed = [...new Set((view?.blocks ?? []).flatMap((item) => item.childSummary?.weakConcepts ?? []))].slice(0, 4);
      if (missed.length > 0) focus = missed.join(", ");
    }
    const result = await startPlannedSession(user.id, {
      method: block.method,
      materialId: block.materialId ?? plan.materialId,
      goal: session.goal,
      plannedMinutes: block.minutes,
      questionCount: block.questionCount,
      timed: true,
      focus,
      focusConcepts: block.concepts.length > 0 ? block.concepts : undefined,
      parentSessionId: session.id,
      parentBlockKey: block.key,
    });
    revalidate(session.id);
    return { ok: true, data: { redirect: result.redirect } };
  } catch (error) {
    return failure(error, "The block could not be started.");
  }
}

export async function skipSmartBlockAction(input: { sessionId: string; key: string }): Promise<StudyActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ sessionId: uuid, key: z.string().min(1).max(40) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid block." };
  try {
    await markSmartBlock(parsed.data.sessionId, parsed.data.key, { status: "skipped" });
    revalidate(parsed.data.sessionId);
    return { ok: true };
  } catch (error) {
    return failure(error, "The block could not be skipped.");
  }
}

export async function completeSmartSessionAction(sessionId: string): Promise<StudyActionResult<SessionSummary>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = uuid.safeParse(sessionId);
  if (!parsed.success) return { ok: false, message: "Invalid session." };
  try {
    const supabase = await createClient();
    const session = await loadSession(supabase, parsed.data);
    const summary = session.method === "pre_testing" ? await completePreTesting(parsed.data) : await completeSmartSession(parsed.data);
    revalidate(parsed.data);
    return { ok: true, data: summary };
  } catch (error) {
    return failure(error, "The session could not be summarized.");
  }
}
