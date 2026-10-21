"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isAiError } from "@/lib/ai";
import { isValidTimezone } from "@/lib/planner/dates";
import { completeGoal, createGoal, deleteGoal } from "@/lib/planner/goals";
import { getTask } from "@/lib/planner/queries";
import {
  archiveExam,
  completeTask,
  createExam,
  deleteExam,
  deleteTask,
  PlannerError,
  rebalancePlan,
  regeneratePlan,
  reopenTask,
  saveActivity,
  scheduleReviewCycle,
  skipTask,
  updateExam,
  updatePlanSettings,
} from "@/lib/planner/service";
import type { ActivityInput, ExamFormInput, GoalFormInput } from "@/lib/planner/types";
import { routes } from "@/lib/routes";
import { isBuilderMethod, isTestMethod, type BuilderMethodId } from "@/lib/study/catalog";
import { ServiceError, SessionError, startSession } from "@/lib/study/service";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type PlannerActionResult<T = undefined> = ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T })) | { ok: false; message: string };

const uuid = z.uuid();

function revalidate(examId?: string | null) {
  revalidatePath(routes.planner);
  revalidatePath(routes.dashboard);
  revalidatePath(routes.materials);
  if (examId) revalidatePath(`${routes.planner}/${examId}`);
}

function failure(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof PlannerError || error instanceof SessionError || error instanceof ServiceError) return { ok: false, message: error.message };
  if (isAiError(error)) return { ok: false, message: error.message };
  console.error(fallback, error);
  return { ok: false, message: fallback };
}

export async function createExamAction(input: ExamFormInput): Promise<PlannerActionResult<{ examId: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  try {
    const result = await createExam(input);
    revalidate(result.examId);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "The exam could not be saved.");
  }
}

export async function updateExamAction(examId: string, input: ExamFormInput): Promise<PlannerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(examId).success) return { ok: false, message: "Invalid exam." };
  try {
    await updateExam(examId, input);
    revalidate(examId);
    return { ok: true };
  } catch (error) {
    return failure(error, "The exam could not be updated.");
  }
}

export async function deleteExamAction(examId: string): Promise<PlannerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(examId).success) return { ok: false, message: "Invalid exam." };
  try {
    await deleteExam(examId);
    revalidate(examId);
    return { ok: true };
  } catch (error) {
    return failure(error, "The exam could not be deleted.");
  }
}

export async function archiveExamAction(examId: string, archived: boolean): Promise<PlannerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(examId).success) return { ok: false, message: "Invalid exam." };
  try {
    await archiveExam(examId, archived);
    revalidate(examId);
    return { ok: true };
  } catch (error) {
    return failure(error, "The exam could not be archived.");
  }
}

export async function regeneratePlanAction(planId: string): Promise<PlannerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(planId).success) return { ok: false, message: "Invalid plan." };
  try {
    await regeneratePlan(planId);
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error, "The plan could not be regenerated.");
  }
}

export async function updatePlanSettingsAction(planId: string, settings: { mode: "exam" | "cram"; availableDays: number[]; minutesPerDay: number }): Promise<PlannerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z
    .object({ planId: uuid, mode: z.enum(["exam", "cram"]), availableDays: z.array(z.number().int().min(0).max(6)).min(1).max(7), minutesPerDay: z.number().int().min(5).max(480) })
    .safeParse({ planId, ...settings });
  if (!parsed.success) return { ok: false, message: "Pick at least one study day and a daily budget between 5 and 480 minutes." };
  try {
    await updatePlanSettings(parsed.data.planId, { mode: parsed.data.mode, availableDays: parsed.data.availableDays, minutesPerDay: parsed.data.minutesPerDay });
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error, "The plan settings could not be saved.");
  }
}

export async function rebalancePlanAction(planId: string): Promise<PlannerActionResult<{ note: string | null }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(planId).success) return { ok: false, message: "Invalid plan." };
  try {
    const result = await rebalancePlan(planId, { force: true });
    revalidate();
    return { ok: true, data: { note: result.note } };
  } catch (error) {
    return failure(error, "The plan could not be adjusted.");
  }
}

/** "Start" on a task: opens a session of the task's method sized to its minutes (flashcards go to the review page). */
export async function startTaskAction(taskId: string): Promise<PlannerActionResult<{ redirect: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(taskId).success) return { ok: false, message: "Invalid task." };
  try {
    const task = await getTask(taskId);
    if (!task) return { ok: false, message: "Task not found." };
    if (task.status === "done") return { ok: false, message: "This task is already done." };
    if (task.session_id) {
      const supabase = await createClient();
      const { data: session } = await supabase.from("study_sessions").select("id, status, method, state").eq("id", task.session_id).maybeSingle();
      if (session?.status === "in_progress") {
        const conversationId = (session.state as { conversationId?: string } | null)?.conversationId;
        return { ok: true, data: { redirect: conversationId ? `${routes.tutor}/${conversationId}` : `${routes.study}/${session.id}` } };
      }
    }
    if (task.method === "activity") return { ok: false, message: "This activity has no study session. Mark it done when you have finished it." };
    if (task.method === "spaced_repetition") return { ok: true, data: { redirect: `${routes.flashcards}/review?task=${task.id}` } };
    const candidate = task.method === "review" ? "active_recall" : task.method;
    if (!isBuilderMethod(candidate) || candidate === "smart_study") return { ok: false, message: "This task's method cannot be started yet. Mark it done when you have studied it." };
    const method: BuilderMethodId = candidate;
    const minutes = Math.max(1, Math.min(480, task.minutes));
    const result = await startSession(user.id, {
      method,
      materialId: task.material_id,
      goal: task.method === "review" ? "quick_review" : isTestMethod(method) || method === "rapid_review" ? "exam_prep" : "practice",
      plannedMinutes: minutes,
      questionCount: isTestMethod(method) ? Math.max(5, Math.min(30, Math.round(minutes / 1.5))) : undefined,
      timed: isTestMethod(method) ? true : undefined,
      workMinutes: method === "pomodoro" ? Math.min(60, minutes) : undefined,
      breakMinutes: method === "pomodoro" ? 5 : undefined,
      topic: method === "pomodoro" ? task.title.replace(/^Focused study:\s*/, "").slice(0, 120) : undefined,
      taskId: task.id,
    });
    revalidate(task.exam_id);
    return { ok: true, data: { redirect: result.redirect } };
  } catch (error) {
    return failure(error, "The task could not be started.");
  }
}

export async function completeTaskAction(taskId: string): Promise<PlannerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(taskId).success) return { ok: false, message: "Invalid task." };
  try {
    await completeTask(taskId);
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error, "The task could not be completed.");
  }
}

export async function skipTaskAction(taskId: string): Promise<PlannerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(taskId).success) return { ok: false, message: "Invalid task." };
  try {
    await skipTask(taskId);
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error, "The task could not be skipped.");
  }
}

export async function reopenTaskAction(taskId: string): Promise<PlannerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(taskId).success) return { ok: false, message: "Invalid task." };
  try {
    await reopenTask(taskId);
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error, "The task could not be reopened.");
  }
}

export async function deleteTaskAction(taskId: string): Promise<PlannerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(taskId).success) return { ok: false, message: "Invalid task." };
  try {
    await deleteTask(taskId);
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error, "The task could not be deleted.");
  }
}

/** Adds a calendar activity, or edits one with `taskId`. */
export async function saveActivityAction(input: ActivityInput, taskId: string | null = null): Promise<PlannerActionResult<{ taskId: string; remindAt: string | null }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (taskId !== null && !uuid.safeParse(taskId).success) return { ok: false, message: "Invalid activity." };
  try {
    const result = await saveActivity(input, taskId);
    revalidate(input.examId ?? null);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "The activity could not be saved.");
  }
}

export async function scheduleReviewCycleAction(materialId: string): Promise<PlannerActionResult<{ created: number; dates: string[] }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(materialId).success) return { ok: false, message: "Invalid material." };
  try {
    const result = await scheduleReviewCycle(materialId);
    revalidate();
    revalidatePath(`${routes.materials}/${materialId}`);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "The reviews could not be scheduled.");
  }
}

export async function createGoalAction(input: GoalFormInput): Promise<PlannerActionResult<{ goalId: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  try {
    const result = await createGoal(input);
    revalidate();
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "The goal could not be saved.");
  }
}

export async function completeGoalAction(goalId: string, completed: boolean): Promise<PlannerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(goalId).success) return { ok: false, message: "Invalid goal." };
  try {
    await completeGoal(goalId, completed);
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error, "The goal could not be updated.");
  }
}

export async function deleteGoalAction(goalId: string): Promise<PlannerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!uuid.safeParse(goalId).success) return { ok: false, message: "Invalid goal." };
  try {
    await deleteGoal(goalId);
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error, "The goal could not be deleted.");
  }
}

/** Stores the browser's time zone so "today" matches the student's calendar. */
export async function setTimezoneAction(timezone: string): Promise<PlannerActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Not signed in." };
  if (!isValidTimezone(timezone)) return { ok: false, message: "Unknown time zone." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ timezone }).eq("id", user.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (error) {
    return failure(error, "The time zone could not be saved.");
  }
}
