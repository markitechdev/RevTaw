"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { routes } from "@/lib/routes";
import { actionFailure, revalidateStudy, uuid, type StudyActionResult } from "@/lib/study/action-helpers";
import { evaluateCaseItem, evaluateScenarioItem, type CaseResult, type ScenarioResult } from "@/lib/study/flows/applied";
import { evaluateProblemItem, type ProblemResult } from "@/lib/study/flows/problems";
import { advanceReading, markSectionRead, submitReadingSummary, type ReadingSummaryResult } from "@/lib/study/flows/reading";
import { checkVisualItem, type VisualCheck } from "@/lib/study/flows/visual";
import { saveItemDraft } from "@/lib/study/items";
import type { ReadingStage } from "@/lib/study/reading-options";
import type { VisualAnswer } from "@/lib/study/visuals";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Server Actions for the Phase 8 (part 2) study methods. Every action checks
 * the session, validates its input, and relies on RLS for ownership.
 */

const responseMs = z.number().int().min(0).max(86_400_000).nullable();

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  return user;
}

/** Keeps an unfinished answer so a refresh restores it (§53). */
export async function saveItemDraftAction(input: { itemId: string; draft: string }): Promise<StudyActionResult> {
  await requireUser();
  const parsed = z.object({ itemId: uuid, draft: z.string().max(8000) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "The draft could not be saved." };
  try {
    await saveItemDraft(parsed.data.itemId, parsed.data.draft);
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "The draft could not be saved.");
  }
}

export async function evaluateProblemAction(input: { itemId: string; work: string; responseMs: number | null }): Promise<StudyActionResult<ProblemResult>> {
  await requireUser();
  const parsed = z.object({ itemId: uuid, work: z.string().max(8000), responseMs }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That answer could not be checked." };
  try {
    return { ok: true, data: await evaluateProblemItem(parsed.data) };
  } catch (error) {
    return actionFailure(error, "Your working could not be checked. Please try again.");
  }
}

export async function evaluateScenarioAction(input: { itemId: string; choice: number; justification: string; responseMs: number | null }): Promise<StudyActionResult<ScenarioResult>> {
  await requireUser();
  const parsed = z.object({ itemId: uuid, choice: z.number().int().min(0).max(10), justification: z.string().max(4000), responseMs }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose an action and justify it." };
  try {
    return { ok: true, data: await evaluateScenarioItem(parsed.data) };
  } catch (error) {
    return actionFailure(error, "Your answer could not be checked. Please try again.");
  }
}

const caseAnswer = z.object({ problem: z.string().max(3000), evidence: z.string().max(3000), solutions: z.string().max(3000), best_solution: z.string().max(3000), justification: z.string().max(3000) });

export async function evaluateCaseAction(input: { itemId: string; answer: z.input<typeof caseAnswer>; responseMs: number | null }): Promise<StudyActionResult<CaseResult>> {
  await requireUser();
  const parsed = z.object({ itemId: uuid, answer: caseAnswer, responseMs }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That analysis could not be checked." };
  try {
    return { ok: true, data: await evaluateCaseItem(parsed.data) };
  } catch (error) {
    return actionFailure(error, "Your analysis could not be checked. Please try again.");
  }
}

const readingStage = z.enum(["survey", "question", "read", "reflect", "recite", "review", "done"]);

export async function advanceReadingAction(input: { sessionId: string; to: z.input<typeof readingStage>; expectations?: string | null; questions?: Array<{ section: number; question: string }> }): Promise<StudyActionResult<{ stage: ReadingStage }>> {
  await requireUser();
  const parsed = z
    .object({
      sessionId: uuid,
      to: readingStage,
      expectations: z.string().max(1000).nullable().optional(),
      questions: z.array(z.object({ section: z.number().int().min(0).max(20), question: z.string().max(300) })).max(30).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "That stage could not be saved." };
  try {
    const stage = await advanceReading(parsed.data);
    revalidateStudy(parsed.data.sessionId);
    return { ok: true, data: { stage } };
  } catch (error) {
    return actionFailure(error, "The next stage could not be prepared. Please try again.");
  }
}

export async function markSectionReadAction(input: { sessionId: string; section: number }): Promise<StudyActionResult<{ readSections: number[] }>> {
  await requireUser();
  const parsed = z.object({ sessionId: uuid, section: z.number().int().min(0).max(20) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That section could not be marked." };
  try {
    return { ok: true, data: { readSections: await markSectionRead(parsed.data) } };
  } catch (error) {
    return actionFailure(error, "That section could not be marked.");
  }
}

export async function submitReadingSummaryAction(input: { sessionId: string; summary: string; responseMs: number | null }): Promise<StudyActionResult<ReadingSummaryResult>> {
  await requireUser();
  const parsed = z.object({ sessionId: uuid, summary: z.string().trim().min(10, "Write a few sentences first.").max(6000), responseMs }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That summary could not be checked." };
  try {
    return { ok: true, data: await submitReadingSummary(parsed.data) };
  } catch (error) {
    return actionFailure(error, "Your summary could not be checked. Please try again.");
  }
}

const visualAnswer = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("order"), order: z.array(z.number().int().min(0).max(50)).max(50) }),
  z.object({ kind: z.literal("cells"), cells: z.array(z.object({ row: z.number().int().min(0).max(50), column: z.number().int().min(0).max(10), value: z.string().max(300) })).max(60) }),
  z.object({ kind: z.literal("parents"), parents: z.array(z.object({ label: z.string().max(200), parent: z.string().max(200) })).max(60) }),
  z.object({ kind: z.literal("relations"), relations: z.array(z.string().max(60)).max(20) }),
]);

export async function checkVisualAction(input: { itemId: string; answer: VisualAnswer; responseMs: number | null }): Promise<StudyActionResult<VisualCheck>> {
  await requireUser();
  const parsed = z.object({ itemId: uuid, answer: visualAnswer, responseMs }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That rebuild could not be checked." };
  try {
    return { ok: true, data: await checkVisualItem(parsed.data) };
  } catch (error) {
    return actionFailure(error, "Your rebuild could not be checked. Please try again.");
  }
}
