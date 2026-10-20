"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { completeSmartSession, markSmartBlock, parseSmartPlan } from "@/lib/adaptive/smart";
import { isAiError } from "@/lib/ai";
import { routes } from "@/lib/routes";
import { BUILDER_METHOD_IDS } from "@/lib/study/catalog";
import {
  analyzeFeynmanItem,
  answerRecallItem,
  completeItemSession,
  completePomodoro,
  savePomodoro,
  ServiceError,
  SessionError,
  startSession,
  type FeynmanRoundResult,
  type RecallItemResult,
  type StartSessionResult,
} from "@/lib/study/service";
import { loadSession, type SessionSummary } from "@/lib/study/sessions";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type StudyActionResult<T = undefined> = ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T })) | { ok: false; message: string };

const uuid = z.uuid();

function revalidate(sessionId?: string) {
  revalidatePath(routes.study);
  revalidatePath(routes.dashboard);
  revalidatePath(`${routes.quiz}/mistakes`);
  if (sessionId) revalidatePath(`${routes.study}/${sessionId}`);
}

function failure(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof SessionError || error instanceof ServiceError) return { ok: false, message: error.message };
  if (isAiError(error)) return { ok: false, message: error.message };
  console.error(fallback, error);
  return { ok: false, message: fallback };
}

const startSchema = z.object({
  method: z.enum(BUILDER_METHOD_IDS),
  materialId: uuid.nullable(),
  materialIds: z.array(uuid).max(4).optional(),
  goal: z.enum(["memorize", "understand", "practice", "exam_prep", "quick_review", "master_topic"]).nullable(),
  plannedMinutes: z.number().int().min(1).max(480),
  questionCount: z.number().int().min(3).max(50).optional(),
  timed: z.boolean().optional(),
  workMinutes: z.number().int().min(1).max(120).optional(),
  breakMinutes: z.number().int().min(1).max(60).optional(),
  topic: z.string().trim().max(120).nullable().optional(),
});

export async function startSessionAction(input: z.input<typeof startSchema>): Promise<StudyActionResult<StartSessionResult>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the session settings." };
  try {
    const result = await startSession(user.id, parsed.data);
    revalidate();
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

export async function analyzeFeynmanAction(input: { itemId: string; explanation: string; responseMs: number | null }): Promise<StudyActionResult<FeynmanRoundResult>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ itemId: uuid, explanation: z.string().max(8000), responseMs: z.number().int().min(0).max(86_400_000).nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That explanation could not be saved." };
  try {
    const result = await analyzeFeynmanItem(parsed.data);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "Your explanation could not be analysed. Please try again.");
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
    if (session.status !== "in_progress") return { ok: false, message: "This smart session has already ended." };
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
    const result = await startSession(user.id, {
      method: block.method,
      materialId: plan.materialId,
      goal: session.goal,
      plannedMinutes: block.minutes,
      questionCount: block.questionCount,
      timed: true,
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
    const summary = await completeSmartSession(parsed.data);
    revalidate(parsed.data);
    return { ok: true, data: summary };
  } catch (error) {
    return failure(error, "The session could not be summarized.");
  }
}
