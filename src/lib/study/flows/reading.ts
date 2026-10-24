import "server-only";

import { isAiError } from "@/lib/ai";
import { normalizeConceptName } from "@/lib/concepts/service";
import { parseAnalysisData } from "@/lib/materials/analysis-schema";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { materialSections } from "@/lib/study/advanced";
import { compareBlurt, type BlurtComparison } from "@/lib/study/ai";
import { conceptsFor, insertItems, openSession, recordItemResult, type Client, type FlowStartInput, type FlowStartResult, type ItemRow } from "@/lib/study/items";
import { answerReadingQuestions, generateReflectQuestions } from "@/lib/study/prompts/reading";
import { MAX_QUESTIONS_PER_SECTION, READING_STAGES, readReadingState, type ReadingMethod, type ReadingStage, type ReadingState } from "@/lib/study/reading-options";
import { loadSession, SessionError, sessionTitle } from "@/lib/study/sessions";
import type { Json, StudySession } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * SQ3R and PQ4R (§16): RevTaw guides the student through every stage instead
 * of describing them. The stage, the sections being read and what was marked
 * read live in `study_sessions.state`, so a refresh resumes at the same stage.
 * The student's questions (answered from memory in Recite) and PQ4R's
 * conceptual Reflect questions are `stage` items graded like recall prompts;
 * the closing summary is a `stage` item compared with the sections.
 */

const SECTION_CHARS = 6000;

function titled(heading: string): boolean {
  return !/^Part \d+$/.test(heading);
}

export async function startGuidedReading(supabase: Client, userId: string, input: FlowStartInput, method: ReadingMethod): Promise<FlowStartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const all = materialSections(context.chunks);
  if (all.length === 0) throw new SessionError("This material is too short for a guided reading.", 422);
  const count = Math.max(2, Math.min(6, Math.round(input.plannedMinutes / 8)));
  const { data: analysisRow } = await supabase.from("material_analyses").select("summary, data").eq("material_id", context.material.id).maybeSingle();
  const analysis = analysisRow ? parseAnalysisData(analysisRow.data) : null;
  const state: ReadingState = {
    stage: "survey",
    sections: all.slice(0, count).map((section) => ({ heading: section.heading, text: section.text.slice(0, SECTION_CHARS) })),
    survey: { summary: analysisRow?.summary ?? null, concepts: (analysis?.key_concepts ?? []).map((concept) => concept.name).slice(0, 10) },
    expectations: null,
    readSections: [],
  };
  const sessionId = await openSession(supabase, userId, {
    method,
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "understand",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle(method, context.material.title),
    state: state as unknown as Record<string, unknown>,
  });
  return { sessionId, redirect: `/study/${sessionId}` };
}

async function loadReading(supabase: Client, sessionId: string): Promise<{ session: StudySession; state: ReadingState; method: ReadingMethod }> {
  const session = await loadSession(supabase, sessionId);
  if (session.status !== "in_progress") throw new SessionError("This session is already finished.", 409);
  if (session.method !== "sq3r" && session.method !== "pq4r") throw new SessionError("This is not a guided reading session.", 400);
  const state = readReadingState(session.state);
  if (!state) throw new SessionError("This reading session has no sections.", 422);
  return { session, state, method: session.method };
}

async function saveState(supabase: Client, session: StudySession, state: ReadingState): Promise<void> {
  const { error } = await supabase
    .from("study_sessions")
    .update({ state: { ...((session.state as Record<string, unknown>) ?? {}), ...state } as unknown as Json, last_active_at: new Date().toISOString() })
    .eq("id", session.id);
  if (error) throw new Error(`study_sessions: state update failed: ${error.message}`);
}

async function stageItems(supabase: Client, sessionId: string, format: string): Promise<Array<{ id: string; answered_at: string | null }>> {
  const { data } = await supabase.from("study_session_items").select("id, answered_at").eq("session_id", sessionId).eq("kind", "stage").eq("format", format);
  return data ?? [];
}

async function nextPosition(supabase: Client, sessionId: string): Promise<number> {
  const { count } = await supabase.from("study_session_items").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  return count ?? 0;
}

export type AdvanceReadingInput = {
  sessionId: string;
  to: ReadingStage;
  expectations?: string | null;
  questions?: Array<{ section: number; question: string }>;
};

/** Moves to the next stage after checking the current one is done; returns the new stage. */
export async function advanceReading(input: AdvanceReadingInput): Promise<ReadingStage> {
  const supabase = await createClient();
  const { session, state, method } = await loadReading(supabase, input.sessionId);
  const stages = READING_STAGES[method];
  const current = stages.indexOf(state.stage as (typeof stages)[number]);
  if (current === -1 || stages[current + 1] !== input.to) throw new SessionError("Finish this stage first.", 409);

  switch (state.stage) {
    case "survey":
      state.expectations = input.expectations?.trim().slice(0, 1000) || null;
      break;
    case "question": {
      const questions = (input.questions ?? [])
        .map((entry) => ({ section: entry.section, question: entry.question.trim().slice(0, 300) }))
        .filter((entry) => entry.question.length >= 5 && entry.section >= 0 && entry.section < state.sections.length);
      if (questions.length === 0) throw new SessionError("Write at least one question to read for.", 400);
      const perSection = new Map<number, number>();
      for (const entry of questions) perSection.set(entry.section, (perSection.get(entry.section) ?? 0) + 1);
      if ([...perSection.values()].some((value) => value > MAX_QUESTIONS_PER_SECTION)) throw new SessionError(`Keep it to ${MAX_QUESTIONS_PER_SECTION} questions per section.`, 400);
      const answers = await answerReadingQuestions({ materialTitle: session.title, sections: state.sections, questions });
      const byIndex = new Map(answers.answers.map((answer) => [answer.index, answer]));
      const headings = [...new Set(questions.map((entry) => state.sections[entry.section].heading).filter(titled))];
      const context = await loadMaterialContext(supabase, session.material_id!);
      const concepts = await conceptsFor(supabase, session.user_id, context, headings);
      const start = await nextPosition(supabase, session.id);
      const rows: ItemRow[] = questions.map((entry, index) => {
        const answer = byIndex.get(index);
        const heading = state.sections[entry.section].heading;
        return {
          session_id: session.id,
          user_id: session.user_id,
          position: start + index,
          kind: "stage",
          concept_id: titled(heading) ? (concepts.get(normalizeConceptName(heading)) ?? null) : null,
          prompt: entry.question,
          model_answer: answer?.model_answer ?? state.sections[entry.section].text.slice(0, 600),
          key_points: (answer?.key_points ?? []) as unknown as Json,
          source_excerpt: null,
          format: "question",
          analysis: { section: entry.section, covered: answer?.covered ?? true } as unknown as Json,
        };
      });
      await insertItems(supabase, rows);
      break;
    }
    case "read":
      if (state.readSections.length < state.sections.length) throw new SessionError("Mark every section as read first.", 409);
      if (method === "pq4r") {
        const generated = await generateReflectQuestions({ materialTitle: session.title, sections: state.sections, count: Math.min(4, Math.max(2, state.sections.length)) });
        const context = await loadMaterialContext(supabase, session.material_id!);
        const concepts = await conceptsFor(supabase, session.user_id, context, generated.questions.map((question) => question.concept));
        const start = await nextPosition(supabase, session.id);
        await insertItems(
          supabase,
          generated.questions.map((question, index) => ({
            session_id: session.id,
            user_id: session.user_id,
            position: start + index,
            kind: "stage" as const,
            concept_id: concepts.get(normalizeConceptName(question.concept)) ?? null,
            prompt: question.prompt,
            model_answer: question.model_answer,
            key_points: question.key_points as unknown as Json,
            source_excerpt: null,
            format: "reflect",
            analysis: { reflect: question.kind } as unknown as Json,
          })),
        );
      }
      break;
    case "reflect":
      if ((await stageItems(supabase, session.id, "reflect")).some((item) => !item.answered_at)) throw new SessionError("Answer every reflection question first.", 409);
      break;
    case "recite":
      if ((await stageItems(supabase, session.id, "question")).some((item) => !item.answered_at)) throw new SessionError("Recite every question first.", 409);
      break;
    default:
      throw new SessionError("Finish this stage first.", 409);
  }
  state.stage = input.to;
  await saveState(supabase, session, state);
  return input.to;
}

export async function markSectionRead(input: { sessionId: string; section: number }): Promise<number[]> {
  const supabase = await createClient();
  const { session, state } = await loadReading(supabase, input.sessionId);
  if (state.stage !== "read") throw new SessionError("Sections are marked during the Read stage.", 409);
  if (input.section < 0 || input.section >= state.sections.length) throw new SessionError("Unknown section.", 400);
  state.readSections = [...new Set([...state.readSections, input.section])].sort((a, b) => a - b);
  await saveState(supabase, session, state);
  return state.readSections;
}

export type ReadingSummaryResult = { comparison: BlurtComparison };

/** Review: the student's own summary of the chapter, compared with the sections. */
export async function submitReadingSummary(input: { sessionId: string; summary: string; responseMs: number | null }): Promise<ReadingSummaryResult> {
  const supabase = await createClient();
  const { session, state } = await loadReading(supabase, input.sessionId);
  if (state.stage !== "review") throw new SessionError("Write the summary in the Review stage.", 409);
  const source = state.sections.map((section) => `${section.heading}\n${section.text}`).join("\n\n").slice(0, 6000);
  const keyPoints = [...state.survey.concepts, ...state.sections.map((section) => section.heading).filter(titled)].filter((value, index, all) => all.indexOf(value) === index).slice(0, 10);
  let comparison: BlurtComparison;
  try {
    comparison = (await compareBlurt({ materialTitle: session.title, topic: "the whole reading", source, keyPoints, studentText: input.summary, attempt: 2 })).comparison;
  } catch (error) {
    if (!isAiError(error)) throw error;
    comparison = { remembered: [], missing: [], incorrect: [], forgotten_important: [], score: 50, feedback: "Tamari can't check this right now, so compare your summary with the sections yourself." };
  }
  const position = await nextPosition(supabase, session.id);
  const { data: inserted, error } = await supabase
    .from("study_session_items")
    .insert({ session_id: session.id, user_id: session.user_id, position, kind: "stage", concept_id: null, prompt: "Summarize the reading in your own words.", model_answer: source.slice(0, 4000), key_points: keyPoints as unknown as Json, source_excerpt: null, format: "summary" })
    .select("*")
    .single();
  if (error || !inserted) throw new Error(`study_session_items: insert failed: ${error?.message}`);
  await recordItemResult(supabase, inserted, session, { response: input.summary, analysis: comparison as unknown as Json, score: comparison.score, isCorrect: comparison.score >= 60, responseMs: input.responseMs, mistake: null });
  state.stage = "done";
  await saveState(supabase, { ...session, state: { ...((session.state as Record<string, unknown>) ?? {}), index: position + 1 } as Json }, state);
  return { comparison };
}
