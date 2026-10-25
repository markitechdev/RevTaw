import "server-only";

import { z } from "zod";

import { smartPlanSchema, type SmartBlock } from "@/lib/adaptive/smart";
import { BUILDER_METHOD_IDS, methodName } from "@/lib/study/catalog";
import { startUnlessDuplicate, type SessionDuplicate } from "@/lib/study/duplicates";
import { createSession, SessionError } from "@/lib/study/sessions";
import type { Routine, SessionGoal } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Custom study routines (§16 "Custom Study Routine"): a saved, ordered list
 * of blocks ("25-minute Pomodoro, 10 recall prompts, 10 flashcards, mistake
 * review") that runs as one combined session through the smart-session
 * machinery (parent session + child sessions per block).
 */

const ROUTINE_METHODS = BUILDER_METHOD_IDS.filter((id) => id !== "smart_study" && id !== "flashcards");

export const routineBlockSchema = z.object({
  method: z.enum(ROUTINE_METHODS as [string, ...string[]]),
  minutes: z.number().int().min(1).max(240),
  materialId: z.uuid().nullable().optional(),
  questionCount: z.number().int().min(3).max(50).optional(),
});

export const routineFormSchema = z.object({
  title: z.string().trim().min(1, "Give the routine a name.").max(120),
  description: z.string().trim().max(400).nullable().optional(),
  blocks: z.array(routineBlockSchema).min(1, "Add at least one block.").max(12),
});

export type RoutineBlock = z.infer<typeof routineBlockSchema>;
export type RoutineFormInput = z.input<typeof routineFormSchema>;

export type RoutineView = Omit<Routine, "blocks"> & { blocks: RoutineBlock[]; totalMinutes: number };

export function parseRoutineBlocks(value: unknown): RoutineBlock[] {
  const parsed = z.array(routineBlockSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export async function listRoutines(): Promise<RoutineView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("routines").select("*").order("updated_at", { ascending: false }).limit(50);
  if (error) {
    console.error("routines: list failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const blocks = parseRoutineBlocks(row.blocks);
    return { ...row, blocks, totalMinutes: blocks.reduce((sum, block) => sum + block.minutes, 0) };
  });
}

export async function saveRoutine(raw: unknown, routineId: string | null): Promise<{ routineId: string }> {
  const parsed = routineFormSchema.safeParse(raw);
  if (!parsed.success) throw new SessionError(parsed.error.issues[0]?.message ?? "Check the routine.", 400);
  const supabase = await createClient();
  const payload = { title: parsed.data.title, description: parsed.data.description || null, blocks: parsed.data.blocks };
  if (routineId) {
    const { error } = await supabase.from("routines").update(payload).eq("id", routineId);
    if (error) throw new Error(`routines: update failed: ${error.message}`);
    return { routineId };
  }
  const { data, error } = await supabase.from("routines").insert(payload).select("id").single();
  if (error || !data) throw new Error(`routines: insert failed: ${error?.message}`);
  return { routineId: data.id };
}

export async function deleteRoutine(routineId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("routines").delete().eq("id", routineId);
  if (error) throw new Error(`routines: delete failed: ${error.message}`);
}

/**
 * Starts a routine as a parent session whose blocks run like Smart Study blocks. An unfinished run of the
 * same routine (on the same material) is answered instead, unless `allowDuplicate` asks for another.
 */
export async function startRoutine(userId: string, routineId: string, options: { materialId: string | null; goal: SessionGoal | null; allowDuplicate?: boolean }): Promise<{ sessionId: string } | SessionDuplicate> {
  const supabase = await createClient();
  const { data: routine } = await supabase.from("routines").select("*").eq("id", routineId).maybeSingle();
  if (!routine) throw new SessionError("Routine not found.", 404);
  const blocks = parseRoutineBlocks(routine.blocks);
  if (blocks.length === 0) throw new SessionError("This routine has no blocks.", 400);
  return startUnlessDuplicate(supabase, userId, { method: "custom_routine", materialId: options.materialId, routineId }, Boolean(options.allowDuplicate), () =>
    createRoutineSession(supabase, userId, { id: routine.id, title: routine.title, blocks }, options),
  );
}

async function createRoutineSession(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, routine: { id: string; title: string; blocks: RoutineBlock[] }, options: { materialId: string | null; goal: SessionGoal | null }): Promise<{ sessionId: string }> {
  const routineId = routine.id;
  const blocks = routine.blocks;
  const materialIds = [...new Set([options.materialId, ...blocks.map((block) => block.materialId ?? null)].filter((id): id is string => Boolean(id)))];
  const { data: materials } = materialIds.length ? await supabase.from("materials").select("id, title, status").in("id", materialIds) : { data: [] };
  const titles = new Map((materials ?? []).map((material) => [material.id, material.title]));
  const planBlocks: SmartBlock[] = blocks.map((block, index) => {
    const materialId = block.materialId ?? options.materialId ?? null;
    return {
      key: `r${index + 1}`,
      method: block.method as SmartBlock["method"],
      minutes: block.minutes,
      reason: `${methodName(block.method)}${materialId && titles.get(materialId) ? ` on ${titles.get(materialId)}` : ""} — block ${index + 1} of your routine.`,
      concepts: [],
      status: "pending",
      childSessionId: null,
      questionCount: block.questionCount,
      materialId,
    };
  });
  const plan = smartPlanSchema.parse({ blocks: planBlocks, materialId: options.materialId, minutes: Math.max(1, planBlocks.reduce((sum, block) => sum + block.minutes, 0)) });
  const { id } = await createSession(supabase, userId, {
    method: "custom_routine",
    materialId: options.materialId,
    goal: options.goal,
    plannedMinutes: plan.minutes,
    title: `${routine.title} — Routine`,
    state: { plan, routineId },
  });
  await supabase.from("routines").update({ last_used_at: new Date().toISOString() }).eq("id", routineId);
  return { sessionId: id };
}
