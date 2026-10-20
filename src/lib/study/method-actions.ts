"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { routes } from "@/lib/routes";
import { actionFailure, uuid, type StudyActionResult } from "@/lib/study/action-helpers";
import { evaluateScenarioItem, type ScenarioResult } from "@/lib/study/flows/applied";
import { evaluateProblemItem, type ProblemResult } from "@/lib/study/flows/problems";
import { saveItemDraft } from "@/lib/study/items";
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
