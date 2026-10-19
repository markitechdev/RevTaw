"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

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
import type { SessionSummary } from "@/lib/study/sessions";
import { getCurrentUser } from "@/lib/supabase/server";

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
