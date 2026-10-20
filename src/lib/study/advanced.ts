import "server-only";

import { getMasterySummary, refreshMastery } from "@/lib/adaptive/engine";
import { isAiError } from "@/lib/ai";
import { ensureConcepts, normalizeConceptName } from "@/lib/concepts/service";
import { parseAnalysisData } from "@/lib/materials/analysis-schema";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { chunkMaterial, compareBlurt, generateRecallQuestions, type BlurtComparison, type RecallQuestion } from "@/lib/study/ai";
import { RAPID_REVIEW_MINUTES } from "@/lib/study/catalog";
import { RETRIEVAL_FORMATS, type RetrievalFormat } from "@/lib/study/formats";
import { createSession, loadSession, SessionError, sessionTitle, type CreateSessionInput } from "@/lib/study/sessions";
import type { Json, SessionGoal, SessionItemKind, StudySession, StudySessionItem } from "@/lib/supabase/database.types";
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

// ---------------------------------------------------------------------------
// Blurting: write everything you remember about a section, then compare
// ---------------------------------------------------------------------------

export type BlurtRound = BlurtComparison & { round: number };

function headingLike(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && trimmed.length <= 60 && !/[.!?:;,]$/.test(trimmed) && /^[A-Z0-9]/.test(trimmed) && trimmed.split(/\s+/).length <= 6;
}

/** Sections of a material: chunk headings, split again at inline headings (short notes keep several sections). */
export function materialSections(chunks: Array<{ heading: string | null; content: string }>): Array<{ heading: string; text: string }> {
  const sections: Array<{ heading: string; text: string }> = [];
  for (const chunk of chunks) {
    let current = { heading: (chunk.heading ?? "").trim() || `Part ${sections.length + 1}`, lines: [] as string[] };
    for (const line of chunk.content.split("\n")) {
      if (headingLike(line)) {
        if (current.lines.join(" ").trim()) sections.push({ heading: current.heading, text: current.lines.join("\n").trim() });
        current = { heading: line.trim(), lines: [] };
        continue;
      }
      current.lines.push(line);
    }
    if (current.lines.join(" ").trim()) sections.push({ heading: current.heading, text: current.lines.join("\n").trim() });
  }
  // Merge repeated headings (a section split across pages) and drop fragments.
  const merged = new Map<string, string[]>();
  for (const section of sections) merged.set(section.heading, [...(merged.get(section.heading) ?? []), section.text]);
  return [...merged.entries()].map(([heading, parts]) => ({ heading, text: parts.join("\n\n") })).filter((section) => section.text.length > 80);
}

export async function startBlurting(supabase: Client, userId: string, input: AdvancedStartInput): Promise<StartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  // One blurt per section, in the material's order.
  const sections = materialSections(context.chunks);
  if (sections.length === 0) throw new SessionError("This material is too short to blurt.", 422);
  const count = Math.max(1, Math.min(sections.length, Math.round(input.plannedMinutes / 6)));
  const chosen = sections.slice(0, count);
  const { data: analysisRow } = await supabase.from("material_analyses").select("data").eq("material_id", context.material.id).maybeSingle();
  const analysis = analysisRow ? parseAnalysisData(analysisRow.data) : null;
  const concepts = await conceptsFor(supabase, userId, context, chosen.map((section) => section.heading));
  const sessionId = await openSession(supabase, userId, {
    method: "blurting",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "memorize",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("blurting", context.material.title),
    state: { index: 0 },
  });
  const rows: ItemRow[] = chosen.map((section, position) => {
    const lower = section.text.toLowerCase();
    const keyPoints = [
      ...(analysis?.definitions ?? []).filter((definition) => lower.includes(definition.term.toLowerCase())).map((definition) => definition.term),
      ...(analysis?.key_concepts ?? []).filter((concept) => lower.includes(concept.name.toLowerCase())).map((concept) => concept.name),
    ]
      .filter((point, index, all) => all.indexOf(point) === index)
      .slice(0, 8);
    return {
      session_id: sessionId,
      user_id: userId,
      position,
      kind: "blurt",
      concept_id: concepts.get(normalizeConceptName(section.heading)) ?? null,
      prompt: section.heading,
      model_answer: section.text.slice(0, 4000),
      key_points: keyPoints as unknown as Json,
      // The source stays server-side until the last round (never in the client payload).
      source_excerpt: null,
      material_id: null,
      format: null,
    };
  });
  await insertItems(supabase, rows);
  return { sessionId, redirect: `/study/${sessionId}` };
}

export const BLURT_MAX_ROUNDS = 2;

export type BlurtResult = { analysis: BlurtComparison; round: number; final: boolean; source: string | null };

async function loadItem(supabase: Client, itemId: string): Promise<{ item: StudySessionItem; session: StudySession }> {
  const { data: item } = await supabase.from("study_session_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) throw new SessionError("Item not found.", 404);
  const session = await loadSession(supabase, item.session_id);
  if (session.status !== "in_progress") throw new SessionError("This session is already finished.", 409);
  return { item, session };
}

/** Compares one blurt attempt with the section; the source is revealed only after the last round. */
export async function compareBlurtItem(input: { itemId: string; text: string; responseMs: number | null }): Promise<BlurtResult> {
  const supabase = await createClient();
  const { item, session } = await loadItem(supabase, input.itemId);
  if (item.kind !== "blurt") throw new SessionError("This item is not a blurt.", 400);
  const previous = ((item.analysis as { rounds?: BlurtRound[] } | null)?.rounds ?? []) as BlurtRound[];
  if (previous.length >= BLURT_MAX_ROUNDS) {
    const last = previous[previous.length - 1];
    return { analysis: last, round: last.round, final: true, source: item.model_answer };
  }
  const round = previous.length + 1;
  let comparison: BlurtComparison;
  try {
    comparison = (await compareBlurt({ materialTitle: session.title, topic: item.prompt, source: item.model_answer ?? "", keyPoints: Array.isArray(item.key_points) ? (item.key_points as string[]) : [], studentText: input.text, attempt: round })).comparison;
  } catch (error) {
    if (!isAiError(error)) throw error;
    comparison = { remembered: [], missing: [], incorrect: [], forgotten_important: [], score: 50, feedback: "The AI checker is unavailable; compare your text with the source yourself." };
  }
  // A near-complete first blurt needs no retry; otherwise the student gets one more go.
  const final = round >= BLURT_MAX_ROUNDS || comparison.score >= 90;
  const rounds = [...previous, { ...comparison, round }];
  const best = Math.max(...rounds.map((entry) => entry.score));
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("study_session_items")
    .update({
      response: input.text.slice(0, 8000),
      analysis: { rounds } as unknown as Json,
      score: best,
      is_correct: final ? best >= 60 : null,
      response_ms: input.responseMs,
      attempts: item.attempts + 1,
      answered_at: final ? now : null,
    })
    .eq("id", item.id);
  if (error) throw new Error(`study_session_items: update failed: ${error.message}`);
  if (final) {
    const isCorrect = best >= 60;
    await supabase
      .from("study_sessions")
      .update({ items_total: session.items_total + 1, items_correct: session.items_correct + (isCorrect ? 1 : 0), items_incorrect: session.items_incorrect + (isCorrect ? 0 : 1), state: { ...((session.state as Record<string, unknown>) ?? {}), index: item.position + 1 } as Json, last_active_at: now })
      .eq("id", session.id);
    if (!isCorrect && comparison.forgotten_important.length) {
      await supabase.from("mistakes").insert({
        user_id: session.user_id,
        concept_id: item.concept_id,
        material_id: session.material_id,
        question_text: `Blurt everything you remember about: ${item.prompt}`.slice(0, 4000),
        student_answer: input.text.slice(0, 4000) || null,
        correct_answer: `Forgotten: ${comparison.forgotten_important.join("; ")}`.slice(0, 4000),
        explanation: comparison.feedback.slice(0, 4000),
      });
    }
    if (item.concept_id) await refreshMastery([item.concept_id]);
  } else {
    await supabase.from("study_sessions").update({ last_active_at: now }).eq("id", session.id);
  }
  return { analysis: comparison, round, final, source: final ? item.model_answer : null };
}

// ---------------------------------------------------------------------------
// Chunking: read a chunk, answer its recall question, move on
// ---------------------------------------------------------------------------

export async function startChunking(supabase: Client, userId: string, input: AdvancedStartInput): Promise<StartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const count = Math.max(2, Math.min(10, Math.round(input.plannedMinutes / 4)));
  const generated = await chunkMaterial({ materialTitle: context.material.title, chunks: context.chunks, count, student: context.student });
  if (generated.chunks.length === 0) throw new SessionError("The material could not be chunked.", 422);
  const concepts = await conceptsFor(supabase, userId, context, generated.chunks.map((chunk) => chunk.concept));
  const sessionId = await openSession(supabase, userId, {
    method: "chunking",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "understand",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("chunking", context.material.title),
    state: { index: 0, provider: generated.provider },
  });
  await insertItems(
    supabase,
    generated.chunks.map((chunk, position) => ({
      session_id: sessionId,
      user_id: userId,
      position,
      kind: "chunk",
      concept_id: concepts.get(normalizeConceptName(chunk.concept)) ?? null,
      prompt: chunk.recall_question,
      model_answer: chunk.model_answer,
      key_points: chunk.key_points as unknown as Json,
      source_excerpt: chunk.mini_summary.slice(0, 1000),
      material_id: null,
      format: null,
      analysis: { chunk: { title: chunk.title, main_idea: chunk.main_idea, details: chunk.details, mini_summary: chunk.mini_summary } } as unknown as Json,
    })),
  );
  return { sessionId, redirect: `/study/${sessionId}` };
}
