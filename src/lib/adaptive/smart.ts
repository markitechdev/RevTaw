import "server-only";

import { z } from "zod";

import { BLOCK_METHODS, examInScope, isWeakTopic, methodFor, rankConcepts } from "@/lib/adaptive/focus";
import { conceptsPerPlan } from "@/lib/engine/priority";
import { countDueCards } from "@/lib/flashcards/queries";
import { getPreferences } from "@/lib/preferences/queries";
import { BUILDER_METHOD_IDS, isBuilderMethod } from "@/lib/study/catalog";
import { completeSession, createSession, loadSession, SessionError, updateSessionState, type SessionSummary, parseSessionSummary } from "@/lib/study/sessions";
import type { Json, SessionGoal } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { tamariLanguage, type TamariLanguage } from "@/lib/tamari/lines";
import { planTamariBlocks, type TamariPlanInput } from "@/lib/tamari/plan";

/**
 * Smart Study — Tamari's Study Plan (spec "flagship feature", companion doc
 * §5–§6): Tamari composes a session from the student's data instead of
 * asking for a method. A smart session is a parent `study_sessions` row whose
 * `state.plan` lists blocks; each block runs as an ordinary child session
 * that carries `state.parentId`.
 */

export const smartBlockSchema = z.object({
  key: z.string(),
  method: z.enum(BUILDER_METHOD_IDS),
  minutes: z.number().int().min(1).max(240),
  reason: z.string().max(400),
  concepts: z.array(z.string().max(120)).max(8),
  status: z.enum(["pending", "in_progress", "done", "skipped"]).default("pending"),
  childSessionId: z.string().nullable().default(null),
  questionCount: z.number().int().min(3).max(50).optional(),
  /** Custom routines: a block can target its own material. */
  materialId: z.string().nullable().optional(),
  /** Practice-test blocks: the topic or concepts the test should stay on (pre-testing's post-test). */
  focus: z.string().max(400).nullable().optional(),
  /** What the block is called in the plan when it is more than its method ("Weak Topic Quiz", "Retest"). */
  label: z.string().max(60).optional(),
});

export type SmartBlock = z.infer<typeof smartBlockSchema>;

export const smartPlanSchema = z.object({
  blocks: z.array(smartBlockSchema).min(1).max(8),
  materialId: z.string().nullable(),
  minutes: z.number().int().min(1).max(480),
});

export type SmartPlan = z.infer<typeof smartPlanSchema>;

export function parseSmartPlan(value: unknown): SmartPlan | null {
  const parsed = smartPlanSchema.safeParse((value as { plan?: unknown } | null)?.plan ?? value);
  return parsed.success ? parsed.data : null;
}

/** Mistakes this recent count towards "missed three times". */
const REPEAT_WINDOW_DAYS = 30;

type PlanContext = { input: TamariPlanInput; materialId: string | null };

/**
 * What Tamari plans from (companion doc §5, research doc §10–§11): the
 * minutes, the exam date, the concepts ranked by priority (weakness, fading,
 * the exam's scope, what was already studied today), misconceptions, the
 * concept missed most often, open mistakes and due cards — on one material:
 * the one asked for, else the nearest exam's, else the one the top-priority
 * concept comes from, else the last one opened. Read with the student's
 * session (RLS).
 */
async function planContext(request: { materialId: string | null; minutes: number }): Promise<PlanContext> {
  const supabase = await createClient();
  const since = new Date(Date.now() - REPEAT_WINDOW_DAYS * 86_400_000).toISOString();
  const [ranked, dueCards, examSoon, preferences, { data: mistakes }] = await Promise.all([
    rankConcepts(),
    countDueCards(),
    examInScope(),
    getPreferences(),
    supabase.from("mistakes").select("concept_id, material_id, resolved_at, concept:concepts!mistakes_concept_fk(name)").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
  ]);
  const lang = tamariLanguage(preferences.ai.language);
  const examMaterials = (examSoon?.materials ?? []).filter((material) => material.status === "ready");

  let materialId = request.materialId;
  if (!materialId && examMaterials.length > 0) {
    // The exam material holding the top-priority concept, else the exam's first one.
    materialId = ranked.find((concept) => examMaterials.some((material) => material.id === concept.materialId))?.materialId ?? examMaterials[0].id;
  }
  materialId ??= ranked.find((concept) => concept.materialId)?.materialId ?? null;
  if (!materialId) {
    const { data: recent } = await supabase.from("materials").select("id").eq("status", "ready").order("last_opened_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    materialId = recent?.id ?? null;
  }

  let material: { id: string; title: string } | null = null;
  if (materialId) {
    const { data } = await supabase.from("materials").select("id, title, status").eq("id", materialId).maybeSingle();
    material = data && data.status === "ready" ? { id: data.id, title: data.title } : null;
  }

  // The material's concepts by priority, with the ones never studied (coverage).
  const inMaterial = material ? await rankConcepts({ materialId: material.id, includeUnpracticed: true }) : [];
  const perPlan = conceptsPerPlan(request.minutes);
  const practiced = inMaterial.filter((concept) => concept.row);
  const focus = practiced.filter((concept) => concept.parts.need > 0).slice(0, perPlan);
  const overdue = practiced
    .filter((concept) => concept.parts.due > 0)
    .sort((a, b) => Number(a.row!.recall ?? 1) - Number(b.row!.recall ?? 1))
    .map((concept) => concept.name);
  const misconception = practiced.filter((concept) => concept.row!.misconceptions > 0).sort((a, b) => b.row!.misconceptions - a.row!.misconceptions)[0]?.name ?? null;
  // When a concept never studied tops the ranking, the rule table picks how to start it (§11).
  const freshConcepts = inMaterial[0] && !inMaterial[0].row ? inMaterial.filter((concept) => !concept.row && concept.parts.coverage > 0).slice(0, perPlan) : [];
  let fresh: TamariPlanInput["fresh"] = null;
  if (freshConcepts.length > 0) {
    const pick = methodFor(freshConcepts[0], Math.round(request.minutes * 0.35), { allowed: BLOCK_METHODS, dueCards: dueCards > 0 });
    fresh = { names: freshConcepts.map((concept) => concept.name), method: isBuilderMethod(pick.method) ? pick.method : "chunking" };
  }

  const rows = (mistakes ?? []) as unknown as Array<{ concept_id: string | null; material_id: string | null; resolved_at: string | null; concept: { name: string } | null }>;
  const relevant = material ? rows.filter((row) => row.material_id === material.id) : rows;
  const openMistakes = relevant.filter((row) => !row.resolved_at).length;
  // The concept missed most often lately, if it still has an open mistake.
  const counts = new Map<string, { name: string; count: number; open: boolean }>();
  for (const row of relevant) {
    if (!row.concept_id || !row.concept?.name) continue;
    const entry = counts.get(row.concept_id) ?? { name: row.concept.name, count: 0, open: false };
    entry.count += 1;
    entry.open ||= !row.resolved_at;
    counts.set(row.concept_id, entry);
  }
  const repeated = [...counts.values()].filter((entry) => entry.open && entry.count >= 3).sort((a, b) => b.count - a.count)[0] ?? null;

  const examFor = examSoon && material && examMaterials.some((item) => item.id === material.id) ? { title: examSoon.title, daysLeft: examSoon.daysLeft } : null;
  return {
    materialId: material?.id ?? null,
    input: {
      minutes: request.minutes,
      lang,
      material,
      exam: examFor,
      overdue,
      weak: focus.map((concept) => concept.name),
      weakTopics: focus.some(isWeakTopic),
      fresh,
      misconception,
      repeated: repeated ? { name: repeated.name, count: repeated.count } : null,
      openMistakes,
      dueCards,
    },
  };
}

/**
 * Starts Tamari's plan (Smart Study, companion doc §5–§6): the blocks for the
 * minutes, saved on a parent session with Tamari's line for the top of the
 * plan. Each block then runs as an ordinary child session.
 */
export async function startSmartSession(userId: string, input: { materialId: string | null; goal: SessionGoal | null; minutes: number }): Promise<{ sessionId: string }> {
  const supabase = await createClient();
  const context = await planContext({ materialId: input.materialId, minutes: input.minutes });
  const draft = planTamariBlocks(context.input);
  const plan: SmartPlan = { blocks: draft.blocks, materialId: context.materialId, minutes: Math.max(5, Math.round(input.minutes)) };
  const { id } = await createSession(supabase, userId, {
    method: "smart_study",
    materialId: plan.materialId,
    goal: input.goal,
    plannedMinutes: plan.minutes,
    title: draft.title,
    state: { plan, tamari: { intro: draft.intro, language: context.input.lang, exam: context.input.exam?.title ?? null } },
  });
  return { sessionId: id };
}

/** Tamari's line for the top of a plan, saved when the plan was made. */
export function tamariPlanNote(state: unknown): { intro: string; language: TamariLanguage } | null {
  const parsed = z
    .object({ tamari: z.object({ intro: z.string().max(400), language: z.enum(["en", "fil", "taglish"]) }) })
    .safeParse(state);
  return parsed.success ? parsed.data.tamari : null;
}

export type SmartSessionView = {
  plan: SmartPlan;
  blocks: Array<SmartBlock & { childStatus: string | null; childSummary: SessionSummary | null }>;
  nextBlockKey: string | null;
};

/** Reads the plan and reconciles block status with the child sessions. `freshPlan` skips re-reading a plan just written in this render. */
export async function getSmartSessionView(sessionId: string, freshPlan: SmartPlan | null = null): Promise<SmartSessionView | null> {
  const supabase = await createClient();
  const session = await loadSession(supabase, sessionId);
  const plan = freshPlan ?? parseSmartPlan(session.state);
  if (!plan) return null;
  const { data: children } = await supabase
    .from("study_sessions")
    .select("id, method, status, summary, started_at")
    .contains("state", { parentId: sessionId })
    .limit(50);
  const { data: reviews } = await supabase
    .from("study_sessions")
    .select("id, status, summary, started_at")
    .in("method", ["flashcards", "spaced_repetition"])
    .gte("started_at", session.started_at)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(5);

  const byId = new Map((children ?? []).map((child) => [child.id, child]));
  const blocks = plan.blocks.map((block) => {
    let status = block.status;
    let childStatus: string | null = null;
    let childSummary: SessionSummary | null = null;
    if (block.method === "spaced_repetition") {
      const review = reviews?.[0];
      if (review) {
        status = "done";
        childStatus = review.status;
        childSummary = parseSessionSummary(review.summary);
      }
    } else if (block.childSessionId) {
      const child = byId.get(block.childSessionId);
      if (child) {
        childStatus = child.status;
        childSummary = parseSessionSummary(child.summary);
        status = child.status === "in_progress" ? "in_progress" : "done";
      }
    }
    return { ...block, status, childStatus, childSummary };
  });
  const next = blocks.find((block) => block.status === "pending" || block.status === "in_progress") ?? null;
  return { plan, blocks, nextBlockKey: next?.key ?? null };
}

/** Records that a block started as the given child session. */
export async function markSmartBlock(sessionId: string, key: string, patch: { childSessionId?: string | null; status: SmartBlock["status"] }): Promise<void> {
  const supabase = await createClient();
  const session = await loadSession(supabase, sessionId);
  const plan = parseSmartPlan(session.state);
  if (!plan) throw new SessionError("This session has no plan.", 400);
  const blocks = plan.blocks.map((block) => (block.key === key ? { ...block, ...patch } : block));
  await updateSessionState(supabase, sessionId, { plan: { ...plan, blocks } as unknown as Json });
}

/** Closes the smart session with the combined summary of its blocks. */
export async function completeSmartSession(sessionId: string): Promise<SessionSummary> {
  const supabase = await createClient();
  const view = await getSmartSessionView(sessionId);
  if (!view) throw new SessionError("This session has no plan.", 400);
  const summaries = view.blocks.map((block) => block.childSummary).filter((summary): summary is SessionSummary => Boolean(summary));
  const answered = summaries.reduce((sum, summary) => sum + summary.questionsAnswered, 0);
  const correct = summaries.reduce((sum, summary) => sum + summary.correct, 0);
  const weak = [...new Set(summaries.flatMap((summary) => summary.weakConcepts))];
  const strong = [...new Set(summaries.flatMap((summary) => summary.strongConcepts))].filter((name) => !weak.includes(name));
  const focus = summaries.reduce((sum, summary) => sum + summary.durationSeconds, 0);
  const done = view.blocks.filter((block) => block.status === "done").length;
  return completeSession(supabase, sessionId, {
    focusSeconds: focus,
    topics: [...new Set(summaries.flatMap((summary) => summary.topics))],
    questionsAnswered: answered,
    correct,
    incorrect: answered - correct,
    weakConcepts: weak,
    strongConcepts: strong,
    suggestedNext:
      done === 0
        ? "No block was completed. Try a shorter plan so the first block is easy to finish."
        : weak.length > 0
          ? `${weak.slice(0, 2).join(" and ")} still need${weak.length === 1 ? "s" : ""} work — Tamari's next plan will start there.`
          : "Everything you practised today held up. Let spaced repetition carry it; come back when cards are due.",
    nextReviewAt: summaries.map((summary) => summary.nextReviewAt).filter((value): value is string => Boolean(value)).sort()[0] ?? null,
    // Tamari's reaction compares the plan's first quiz with its last retest ("Mas okay na").
    extra: {
      blocksDone: done,
      blocksTotal: view.blocks.length,
      firstAccuracy: view.blocks.find((block) => block.key === "quiz")?.childSummary?.accuracy ?? null,
      lastAccuracy: view.blocks.find((block) => block.key === "retest")?.childSummary?.accuracy ?? null,
    },
    abandoned: done === 0,
  });
}
