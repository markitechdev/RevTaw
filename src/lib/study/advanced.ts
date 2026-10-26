import "server-only";

import { getMasterySummary } from "@/lib/adaptive/engine";
import { isAiError } from "@/lib/ai";
import { normalizeConceptName } from "@/lib/concepts/service";
import { parseAnalysisData } from "@/lib/materials/analysis-schema";
import { loadMaterialContext } from "@/lib/reviewers/service";
import {
  chunkMaterial,
  compareBlurt,
  evaluateStudentQuestion,
  generateRecallQuestions,
  type BlurtComparison,
  type QuestionEvaluation,
  type RecallQuestion,
} from "@/lib/study/ai";
import { RAPID_REVIEW_MINUTES } from "@/lib/study/catalog";
import { RETRIEVAL_FORMATS, type RetrievalFormat } from "@/lib/study/formats";
import { conceptsFor, insertItems, loadOpenItem, openSession, recordUngradedItem, reloadItem, settleAnsweredItem, storeItemAttempt, type Client, type FlowStartInput, type FlowStartResult, type ItemRow, type MaterialContext } from "@/lib/study/items";
import { ungradedView, type UngradedView } from "@/lib/study/results";
import { countSessionAnswer, loadSession, SessionError, sessionTitle } from "@/lib/study/sessions";
import { PASS_SCORE } from "@/lib/study/verdict";
import type { Json, SessionItemKind, StudySessionItem } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Phase 8 study-method sessions. The recall-based methods (retrieval practice,
 * rapid review, cumulative review, interleaving) reuse the recall machinery
 * with a different selection of prompts; other methods add their own flows below.
 */

export type AdvancedStartInput = FlowStartInput;
export type StartResult = FlowStartResult;

function recallCount(minutes: number): number {
  return Math.max(3, Math.min(15, Math.round(minutes / 2)));
}

async function weakNames(materialId: string, limit = 6): Promise<string[]> {
  const summary = await getMasterySummary({ materialId });
  return [...summary.weak, ...summary.misconceptions, ...summary.learning]
    .map((row) => row.concept?.name ?? "")
    .filter((name, index, all) => name && all.indexOf(name) === index)
    .slice(0, limit);
}

async function recallItemsFor(supabase: Client, userId: string, context: MaterialContext, questions: RecallQuestion[], options: { sessionId: string; startPosition: number; materialId?: string | null; kind?: SessionItemKind }): Promise<ItemRow[]> {
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

/**
 * `analysis` is null when Tamari couldn't check this attempt; it ends the section either way. A first attempt
 * is then marked by the student (`ungraded`); after a checked first attempt, that check stands.
 */
export type BlurtResult = { analysis: BlurtComparison | null; round: number; final: boolean; ungraded: UngradedView | null; source: string | null };

/** Compares one blurt attempt with the section; the source is revealed only after the last round. */
export async function compareBlurtItem(input: { itemId: string; text: string; responseMs: number | null }): Promise<BlurtResult> {
  const supabase = await createClient();
  const { item, session } = await loadOpenItem(supabase, input.itemId);
  if (item.kind !== "blurt") throw new SessionError("This item is not a blurt.", 400);
  const previous = ((item.analysis as { rounds?: BlurtRound[] } | null)?.rounds ?? []) as BlurtRound[];
  if (item.answered_at) return storedBlurtRound(item);
  if (previous.length >= BLURT_MAX_ROUNDS) {
    const last = previous[previous.length - 1];
    return { analysis: last, round: last.round, final: true, ungraded: null, source: item.model_answer };
  }
  const round = previous.length + 1;
  let checked: BlurtComparison | null;
  try {
    checked = (await compareBlurt({ materialTitle: session.title, topic: item.prompt, source: item.model_answer ?? "", keyPoints: Array.isArray(item.key_points) ? (item.key_points as string[]) : [], studentText: input.text, attempt: round })).comparison;
  } catch (error) {
    if (!isAiError(error)) throw error;
    checked = null;
  }
  if (!checked && previous.length === 0) {
    // Tamari couldn't check the first attempt: there is nothing to improve on, so the source is shown now
    // and the student marks their blurt against it.
    const stored = await recordUngradedItem(supabase, item, session, {
      response: input.text,
      analysis: { rounds: [] },
      responseMs: input.responseMs,
      mistake: { question: `Blurt everything you remember about: ${item.prompt}`, correctAnswer: (item.model_answer ?? "").slice(0, 2000), explanation: "" },
    });
    if (!stored) return storedBlurtRound(await reloadItem(supabase, item.id));
    return { analysis: null, round, final: true, ungraded: { selfCheck: null }, source: item.model_answer };
  }
  const comparison = checked;
  // A near-complete first blurt needs no retry; otherwise the student gets one more go. An attempt that
  // couldn't be checked ends the section: the checked one stands.
  const final = round >= BLURT_MAX_ROUNDS || !comparison || comparison.score >= 90;
  const rounds = comparison ? [...previous, { ...comparison, round }] : previous;
  // The first attempt is what counts: it is what the student recalled on their own. The retry comes right
  // after the comparison named the gaps, so it shows the gaps being filled, not recall.
  const first = rounds[0];
  const isCorrect = first.score >= PASS_SCORE.blurt;
  const now = new Date().toISOString();
  const stored = await storeItemAttempt(supabase, item, {
    response: input.text.slice(0, 8000),
    analysis: { rounds } as unknown as Json,
    score: first.score,
    is_correct: final ? isCorrect : null,
    response_ms: input.responseMs,
    answered_at: final ? now : null,
  });
  // A double submit (or a second tab) stored this round first: its round stands.
  if (!stored) return storedBlurtRound(await reloadItem(supabase, item.id));
  if (final) {
    const gaps = first.forgotten_important.length ? first.forgotten_important : first.missing;
    await settleAnsweredItem(supabase, item, session, {
      isCorrect,
      response: input.text,
      mistake: gaps.length ? { question: `Blurt everything you remember about: ${item.prompt}`, correctAnswer: `Forgotten at first: ${gaps.slice(0, 8).join("; ")}`, explanation: first.feedback } : null,
    });
  } else {
    await supabase.from("study_sessions").update({ last_active_at: now }).eq("id", session.id);
  }
  return { analysis: comparison, round, final, ungraded: null, source: final ? item.model_answer : null };
}

/** The latest stored round of a blurt item. */
function storedBlurtRound(item: StudySessionItem): BlurtResult {
  const final = Boolean(item.answered_at);
  const source = final ? item.model_answer : null;
  const ungraded = ungradedView(item.analysis);
  if (ungraded && final) return { analysis: null, round: item.attempts, final, ungraded, source };
  const rounds = ((item.analysis as { rounds?: BlurtRound[] } | null)?.rounds ?? []) as BlurtRound[];
  const last = rounds[rounds.length - 1];
  if (!last) throw new SessionError("This blurt is already being checked.", 409);
  return { analysis: last, round: last.round, final, ungraded: null, source };
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

// ---------------------------------------------------------------------------
// Question generation: the student writes questions, RevTaw evaluates them
// ---------------------------------------------------------------------------

export async function startQuestionGeneration(supabase: Client, userId: string, input: AdvancedStartInput): Promise<StartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const target = Math.max(3, Math.min(12, Math.round(input.plannedMinutes / 3)));
  const sessionId = await openSession(supabase, userId, {
    method: "question_generation",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "exam_prep",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("question_generation", context.material.title),
    state: { target },
  });
  return { sessionId, redirect: `/study/${sessionId}` };
}

/** `evaluation` is null when Tamari couldn't rate the question: it is saved without a rating and not counted. */
export type EvaluatedQuestion = { itemId: string; question: string; expectedAnswer: string | null; evaluation: QuestionEvaluation | null };

/** Evaluates one student-written question and stores it as a session item. */
export async function evaluateQuestionItem(input: { sessionId: string; question: string; expectedAnswer: string | null; responseMs: number | null }): Promise<EvaluatedQuestion> {
  const supabase = await createClient();
  const session = await loadSession(supabase, input.sessionId);
  if (session.status !== "in_progress") throw new SessionError("This session is already finished.", 409);
  if (session.method !== "question_generation" || !session.material_id) throw new SessionError("This session does not take questions.", 400);
  const context = await loadMaterialContext(supabase, session.material_id);
  let evaluation: QuestionEvaluation | null;
  try {
    evaluation = (await evaluateStudentQuestion({ materialTitle: context.material.title, chunks: context.chunks, question: input.question, expectedAnswer: input.expectedAnswer })).evaluation;
  } catch (error) {
    if (!isAiError(error)) throw error;
    // Saved without a rating: no made-up scores, no concept guessed, and it doesn't count as good or weak.
    evaluation = null;
  }
  const concepts = evaluation ? await conceptsFor(supabase, session.user_id, context, [evaluation.concept]) : new Map<string, string>();
  const { count } = await supabase.from("study_session_items").select("id", { count: "exact", head: true }).eq("session_id", session.id);
  const position = count ?? 0;
  const good = evaluation ? evaluation.overall >= 60 : null;
  const now = new Date().toISOString();
  const { data: item, error } = await supabase
    .from("study_session_items")
    .insert({
      session_id: session.id,
      user_id: session.user_id,
      position,
      kind: "question",
      concept_id: evaluation ? (concepts.get(normalizeConceptName(evaluation.concept)) ?? null) : null,
      prompt: input.question.slice(0, 4000),
      model_answer: evaluation ? evaluation.model_answer.slice(0, 4000) : (input.expectedAnswer?.slice(0, 4000) ?? null),
      key_points: [] as unknown as Json,
      response: input.expectedAnswer?.slice(0, 8000) ?? null,
      analysis: (evaluation ?? { unrated: true }) as unknown as Json,
      is_correct: good,
      score: evaluation?.overall ?? null,
      response_ms: input.responseMs,
      attempts: 1,
      answered_at: now,
      format: evaluation?.difficulty ?? null,
    })
    .select("id")
    .single();
  if (error || !item) throw new Error(`study_session_items: insert failed: ${error?.message}`);
  await countSessionAnswer(supabase, session.id, { correct: good });
  return { itemId: item.id, question: input.question, expectedAnswer: input.expectedAnswer, evaluation };
}
