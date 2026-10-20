import "server-only";

import { normalizeConceptName } from "@/lib/concepts/service";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { conceptsFor, insertItems, loadOpenItem, openSession, recordItemResult, type Client, type FlowStartInput, type FlowStartResult } from "@/lib/study/items";
import { generateVisualSet, visualSetSchema } from "@/lib/study/prompts/visual";
import { SessionError, sessionTitle } from "@/lib/study/sessions";
import { gradeVisual, visualAsText, type VisualAnswer, type VisualTopic } from "@/lib/study/visuals";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Dual coding (§16): every topic as text and as a visual, with Text / Visual /
 * Combined views, then a "rebuild it from memory" exercise graded on the
 * server. Visual sets are saved in `study_maps` (kind `visual`) and reused for
 * the same material unless the student asks for new ones (§46 cost).
 */

export type DualCodingStartInput = FlowStartInput & { freshVisuals?: boolean };

export type VisualCheck = { score: number; isCorrect: boolean; marks: boolean[] };

async function visualSet(supabase: Client, userId: string, context: Awaited<ReturnType<typeof loadMaterialContext>>, input: DualCodingStartInput): Promise<{ topics: VisualTopic[]; mapId: string; provider: string }> {
  if (!input.freshVisuals) {
    const { data: saved } = await supabase.from("study_maps").select("id, data, provider").eq("material_id", context.material.id).eq("kind", "visual").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const parsed = saved ? visualSetSchema.safeParse(saved.data) : null;
    if (saved && parsed?.success) return { topics: parsed.data.topics, mapId: saved.id, provider: saved.provider ?? "saved" };
  }
  const count = Math.max(2, Math.min(5, Math.round(input.plannedMinutes / 6)));
  const generated = await generateVisualSet({ materialTitle: context.material.title, chunks: context.chunks, student: context.student, count });
  if (generated.topics.length === 0) throw new SessionError("No visuals could be drawn from this material.", 422);
  const { data: map, error } = await supabase
    .from("study_maps")
    .insert({ user_id: userId, material_id: context.material.id, kind: "visual", title: `${context.material.title} — visuals`.slice(0, 160), data: { topics: generated.topics } as unknown as Json, provider: generated.provider, model: generated.model })
    .select("id")
    .single();
  if (error || !map) throw new Error(`study_maps: insert failed: ${error?.message}`);
  return { topics: generated.topics, mapId: map.id, provider: generated.provider };
}

export async function startDualCoding(supabase: Client, userId: string, input: DualCodingStartInput): Promise<FlowStartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const { topics, mapId, provider } = await visualSet(supabase, userId, context, input);
  const sessionId = await openSession(supabase, userId, {
    method: "dual_coding",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "understand",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("dual_coding", context.material.title),
    state: { index: 0, provider, mapId },
  });
  const concepts = await conceptsFor(supabase, userId, context, topics.map((topic) => topic.concept));
  await insertItems(
    supabase,
    topics.map((topic, position) => ({
      session_id: sessionId,
      user_id: userId,
      position,
      kind: "visual" as const,
      concept_id: concepts.get(normalizeConceptName(topic.concept)) ?? null,
      prompt: topic.title,
      model_answer: null,
      key_points: [] as unknown as Json,
      source_excerpt: null,
      format: topic.visual.type,
      analysis: { topic } as unknown as Json,
    })),
  );
  return { sessionId, redirect: `/study/${sessionId}` };
}

export async function checkVisualItem(input: { itemId: string; answer: VisualAnswer; responseMs: number | null }): Promise<VisualCheck> {
  const supabase = await createClient();
  const { item, session } = await loadOpenItem(supabase, input.itemId);
  if (item.kind !== "visual") throw new SessionError("This item is not a visual.", 400);
  const analysis = (item.analysis as { topic?: VisualTopic; check?: VisualCheck } | null) ?? {};
  if (!analysis.topic) throw new SessionError("This visual is incomplete.", 422);
  if (item.answered_at && analysis.check) return analysis.check;
  const graded = gradeVisual(analysis.topic.visual, input.answer);
  const check: VisualCheck = { ...graded, isCorrect: graded.score >= 60 };
  await recordItemResult(supabase, item, session, {
    response: JSON.stringify(input.answer),
    analysis: { ...analysis, check } as unknown as Json,
    score: graded.score,
    isCorrect: check.isCorrect,
    responseMs: input.responseMs,
    mistake: { question: `Rebuild from memory: ${analysis.topic.title}`, correctAnswer: visualAsText(analysis.topic.visual), explanation: "Study the visual again, then rebuild it without looking.", errorType: "forgotten_information" },
  });
  return check;
}
