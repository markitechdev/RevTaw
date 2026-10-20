import "server-only";

import { getMasterySummary } from "@/lib/adaptive/engine";
import { ensureConcepts, normalizeConceptName } from "@/lib/concepts/service";
import { parseAnalysisData } from "@/lib/materials/analysis-schema";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { generateRecallQuestions, type RecallQuestion } from "@/lib/study/ai";
import { RAPID_REVIEW_MINUTES } from "@/lib/study/catalog";
import { RETRIEVAL_FORMATS, type RetrievalFormat } from "@/lib/study/formats";
import { createSession, SessionError, sessionTitle, type CreateSessionInput } from "@/lib/study/sessions";
import type { Json, SessionGoal, SessionItemKind } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
type Context = Awaited<ReturnType<typeof loadMaterialContext>>;

/**
 * Phase 8 study-method sessions. The recall-based methods (retrieval practice,
 * rapid review, cumulative review, interleaving) reuse the recall machinery
 * with a different selection of prompts; other methods add their own flows below.
 */

export type AdvancedStartInput = {
  materialId: string | null;
  materialIds?: string[];
  goal: SessionGoal | null;
  plannedMinutes: number;
};

export type StartResult = { sessionId: string; redirect: string };

type ItemRow = {
  session_id: string;
  user_id: string;
  position: number;
  kind: SessionItemKind;
  concept_id: string | null;
  prompt: string;
  model_answer: string | null;
  key_points: Json;
  source_excerpt: string | null;
  source_mistake_id?: string | null;
  material_id?: string | null;
  format?: string | null;
  analysis?: Json;
};

function recallCount(minutes: number): number {
  return Math.max(3, Math.min(15, Math.round(minutes / 2)));
}

async function conceptsFor(supabase: Client, userId: string, context: Context, names: string[]): Promise<Map<string, string>> {
  return ensureConcepts(supabase, userId, names, { materialId: context.material.id, subjectId: context.material.subject_id });
}

async function weakNames(materialId: string, limit = 6): Promise<string[]> {
  const summary = await getMasterySummary({ materialId });
  return [...summary.weak, ...summary.misconceptions, ...summary.learning]
    .map((row) => row.concept?.name ?? "")
    .filter((name, index, all) => name && all.indexOf(name) === index)
    .slice(0, limit);
}

async function recallItemsFor(supabase: Client, userId: string, context: Context, questions: RecallQuestion[], options: { sessionId: string; startPosition: number; materialId?: string | null; kind?: SessionItemKind }): Promise<ItemRow[]> {
  const concepts = await conceptsFor(supabase, userId, context, questions.map((question) => question.concept));
  return questions.map((question, index) => ({
    session_id: options.sessionId,
    user_id: userId,
    position: options.startPosition + index,
    kind: options.kind ?? "recall",
    concept_id: concepts.get(normalizeConceptName(question.concept)) ?? null,
    prompt: question.prompt,
    model_answer: question.model_answer,
    key_points: question.key_points as unknown as Json,
    source_excerpt: question.source_excerpt || null,
    material_id: options.materialId ?? null,
    format: question.format ?? null,
  }));
}

async function insertItems(supabase: Client, rows: ItemRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("study_session_items").insert(rows);
  if (error) throw new Error(`study_session_items: insert failed: ${error.message}`);
}

async function openSession(supabase: Client, userId: string, input: Omit<CreateSessionInput, "title"> & { title: string }): Promise<string> {
  const { id } = await createSession(supabase, userId, input);
  return id;
}

// ---------------------------------------------------------------------------
// Retrieval practice: rotating formats
// ---------------------------------------------------------------------------

export async function startRetrievalPractice(supabase: Client, userId: string, input: AdvancedStartInput): Promise<StartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const count = recallCount(input.plannedMinutes);
  const formats = [...RETRIEVAL_FORMATS].slice(0, Math.max(3, Math.min(RETRIEVAL_FORMATS.length, count))) as RetrievalFormat[];
  const generated = await generateRecallQuestions({
    materialTitle: context.material.title,
    chunks: context.chunks,
    count,
    focusConcepts: await weakNames(context.material.id),
    recentMistakes: [],
    student: context.student,
    formats,
  });
  if (generated.questions.length === 0) throw new SessionError("No retrieval exercises could be written from this material.", 422);
  const sessionId = await openSession(supabase, userId, {
    method: "retrieval_practice",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal,
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("retrieval_practice", context.material.title),
    state: { index: 0, provider: generated.provider, formats },
  });
  // Guarantee every prompt carries a format even if the model forgot the label.
  const questions = generated.questions.map((question, index) => ({ ...question, format: question.format ?? formats[index % formats.length] }));
  await insertItems(supabase, await recallItemsFor(supabase, userId, context, questions, { sessionId, startPosition: 0 }));
  return { sessionId, redirect: `/study/${sessionId}` };
}

// ---------------------------------------------------------------------------
// Rapid review: mistakes first, then weak concepts and exam topics, 5-15 minutes
// ---------------------------------------------------------------------------

export async function startRapidReview(supabase: Client, userId: string, input: AdvancedStartInput): Promise<StartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const minutes = [...RAPID_REVIEW_MINUTES].reduce((best, option) => (Math.abs(option - input.plannedMinutes) < Math.abs(best - input.plannedMinutes) ? option : best), RAPID_REVIEW_MINUTES[0]);
  const total = Math.max(3, Math.min(10, Math.round(minutes / 1.5)));
  const { data: mistakes } = await supabase
    .from("mistakes")
    .select("id, question_text, correct_answer, explanation, concept_id")
    .eq("material_id", context.material.id)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.floor(total * 0.4)));
  const mistakeRows = mistakes ?? [];
  const { data: analysisRow } = await supabase.from("material_analyses").select("data").eq("material_id", context.material.id).maybeSingle();
  const analysis = analysisRow ? parseAnalysisData(analysisRow.data) : null;
  const emphasis = [...(analysis?.exam_topics ?? []).map((topic) => topic.topic), ...(analysis?.important_facts ?? []).slice(0, 3)].slice(0, 8);
  const remaining = Math.max(1, total - mistakeRows.length);
  const generated = await generateRecallQuestions({
    materialTitle: context.material.title,
    chunks: context.chunks,
    count: remaining,
    focusConcepts: await weakNames(context.material.id, 8),
    recentMistakes: mistakeRows.map((mistake) => mistake.question_text.slice(0, 200)),
    student: context.student,
    emphasis,
  });
  const sessionId = await openSession(supabase, userId, {
    method: "rapid_review",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "quick_review",
    plannedMinutes: minutes,
    title: sessionTitle("rapid_review", context.material.title),
    state: { index: 0, minutes, provider: generated.provider },
  });
  const rows: ItemRow[] = mistakeRows.map((mistake, position) => ({
    session_id: sessionId,
    user_id: userId,
    position,
    kind: "mistake",
    concept_id: mistake.concept_id,
    prompt: mistake.question_text,
    model_answer: mistake.correct_answer,
    key_points: [] as unknown as Json,
    source_excerpt: mistake.explanation?.slice(0, 1000) ?? null,
    source_mistake_id: mistake.id,
    material_id: null,
    format: null,
  }));
  rows.push(...(await recallItemsFor(supabase, userId, context, generated.questions, { sessionId, startPosition: rows.length })));
  if (rows.length === 0) throw new SessionError("Nothing to review yet — take a quiz on this material first.", 422);
  await insertItems(supabase, rows);
  return { sessionId, redirect: `/study/${sessionId}` };
}

// ---------------------------------------------------------------------------
// Cumulative review: 60% current, 20% previous, 10% older, 10% oldest
// ---------------------------------------------------------------------------

export const CUMULATIVE_SPLIT = [0.6, 0.2, 0.1, 0.1] as const;

export async function startCumulativeReview(supabase: Client, userId: string, input: AdvancedStartInput): Promise<StartResult> {
  const current = await loadMaterialContext(supabase, input.materialId!);
  const { data: others } = await supabase
    .from("materials")
    .select("id, title, created_at")
    .eq("status", "ready")
    .neq("id", current.material.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(3);
  const total = recallCount(input.plannedMinutes);
  const lineup = [current.material.id, ...(others ?? []).map((material) => material.id)];
  const counts = lineup.map((_, index) => Math.round(total * CUMULATIVE_SPLIT[index]));
  // Give the current material whatever the missing older materials would have taken.
  counts[0] += total - counts.reduce((sum, count) => sum + count, 0);
  const sessionId = await openSession(supabase, userId, {
    method: "cumulative_review",
    materialId: current.material.id,
    subjectId: current.material.subject_id,
    goal: input.goal ?? "quick_review",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("cumulative_review", current.material.title),
    state: { index: 0, materialIds: lineup },
  });
  const rows: ItemRow[] = [];
  for (const [index, materialId] of lineup.entries()) {
    if (counts[index] <= 0) continue;
    const context = index === 0 ? current : await loadMaterialContext(supabase, materialId);
    const generated = await generateRecallQuestions({ materialTitle: context.material.title, chunks: context.chunks, count: counts[index], focusConcepts: await weakNames(materialId, 4), recentMistakes: [], student: context.student });
    rows.push(...(await recallItemsFor(supabase, userId, context, generated.questions, { sessionId, startPosition: 0, materialId })));
  }
  if (rows.length === 0) throw new SessionError("No recall prompts could be written.", 422);
  // Current material first, then older lessons woven in.
  await insertItems(supabase, rows.map((row, position) => ({ ...row, position })));
  return { sessionId, redirect: `/study/${sessionId}` };
}

// ---------------------------------------------------------------------------
// Interleaving: 2-4 materials, prompts alternate between them
// ---------------------------------------------------------------------------

export async function startInterleaving(supabase: Client, userId: string, input: AdvancedStartInput): Promise<StartResult> {
  const ids = [...new Set([input.materialId, ...(input.materialIds ?? [])].filter((id): id is string => Boolean(id)))].slice(0, 4);
  if (ids.length < 2) throw new SessionError("Pick at least two materials to interleave.", 400);
  const contexts = await Promise.all(ids.map((id) => loadMaterialContext(supabase, id)));
  const total = Math.max(ids.length * 2, recallCount(input.plannedMinutes));
  const perMaterial = Math.max(1, Math.round(total / ids.length));
  const sessionId = await openSession(supabase, userId, {
    method: "interleaving",
    materialId: contexts[0].material.id,
    subjectId: contexts[0].material.subject_id,
    goal: input.goal ?? "exam_prep",
    plannedMinutes: input.plannedMinutes,
    title: `${contexts.map((context) => context.material.title).join(" + ")} — Interleaving`.slice(0, 160),
    state: { index: 0, materialIds: ids },
  });
  const perContext = await Promise.all(
    contexts.map(async (context) => {
      const generated = await generateRecallQuestions({ materialTitle: context.material.title, chunks: context.chunks, count: perMaterial, focusConcepts: await weakNames(context.material.id, 4), recentMistakes: [], student: context.student });
      return recallItemsFor(supabase, userId, context, generated.questions, { sessionId, startPosition: 0, materialId: context.material.id });
    }),
  );
  // Round-robin so consecutive prompts come from different materials.
  const rows: ItemRow[] = [];
  for (let index = 0; index < perMaterial; index += 1) for (const list of perContext) if (list[index]) rows.push(list[index]);
  if (rows.length === 0) throw new SessionError("No recall prompts could be written.", 422);
  await insertItems(supabase, rows.map((row, position) => ({ ...row, position })));
  return { sessionId, redirect: `/study/${sessionId}` };
}
