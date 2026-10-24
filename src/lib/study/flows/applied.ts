import "server-only";

import { weakConceptNames } from "@/lib/adaptive/engine";
import { isAiError } from "@/lib/ai";
import { normalizeConceptName } from "@/lib/concepts/service";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { conceptsFor, insertItems, loadOpenItem, openSession, recordItemResult, type Client, type FlowStartInput, type FlowStartResult } from "@/lib/study/items";
import {
  CASE_FIELDS,
  evaluateCaseAnalysis,
  evaluateJustification,
  generateCases,
  generateScenarios,
  type CaseAnswer,
  type CaseEvaluation,
  type CaseModel,
  type JustificationEvaluation,
} from "@/lib/study/prompts/applied";
import { SessionError, sessionTitle } from "@/lib/study/sessions";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Scenario-based and case-based learning (§16). What the student needs to
 * decide — the situation, the options, the case — is in `analysis`; the best
 * option, rationale and expert analysis stay in `model_answer` (hidden from
 * the browser until the item is answered).
 */

export type ScenarioView = { title: string; situation: string; question: string; options: string[] };
type ScenarioKey = { best_option: number; option_feedback: string[]; rationale: string };

export type ScenarioResult = {
  chosen: number;
  best: number;
  correctChoice: boolean;
  score: number;
  isCorrect: boolean;
  rationale: string;
  optionFeedback: string[];
  evaluation: JustificationEvaluation;
};

export type CaseView = { title: string; text: string; task: string };
export type CaseResult = { evaluation: CaseEvaluation; model: CaseModel; isCorrect: boolean };

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export async function startScenarios(supabase: Client, userId: string, input: FlowStartInput): Promise<FlowStartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const count = Math.max(2, Math.min(8, Math.round(input.plannedMinutes / 5)));
  const generated = await generateScenarios({ materialTitle: context.material.title, chunks: context.chunks, student: context.student, count, focusConcepts: await weakConceptNames(context.material.id, 4) });
  if (generated.scenarios.length === 0) throw new SessionError("No scenarios could be written from this material.", 422);
  const sessionId = await openSession(supabase, userId, {
    method: "scenario_based",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "practice",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("scenario_based", context.material.title),
    state: { index: 0, provider: generated.provider },
  });
  const concepts = await conceptsFor(supabase, userId, context, generated.scenarios.map((scenario) => scenario.concept));
  await insertItems(
    supabase,
    generated.scenarios.map((scenario, position) => {
      const view: ScenarioView = { title: scenario.title, situation: scenario.situation, question: scenario.question, options: scenario.options };
      const key: ScenarioKey = { best_option: scenario.best_option, option_feedback: scenario.option_feedback, rationale: scenario.rationale };
      return {
        session_id: sessionId,
        user_id: userId,
        position,
        kind: "scenario" as const,
        concept_id: concepts.get(normalizeConceptName(scenario.concept)) ?? null,
        prompt: scenario.question,
        model_answer: JSON.stringify(key),
        key_points: scenario.key_points as unknown as Json,
        source_excerpt: null,
        analysis: { scenario: view } as unknown as Json,
      };
    }),
  );
  return { sessionId, redirect: `/study/${sessionId}` };
}

/** Choice (60%) + justification (40%); counts as correct with the best action and a real justification. */
export function scenarioScore(correctChoice: boolean, justificationScore: number): number {
  return Math.round((correctChoice ? 60 : 0) + justificationScore * 0.4);
}

export async function evaluateScenarioItem(input: { itemId: string; choice: number; justification: string; responseMs: number | null }): Promise<ScenarioResult> {
  const supabase = await createClient();
  const { item, session } = await loadOpenItem(supabase, input.itemId);
  if (item.kind !== "scenario") throw new SessionError("This item is not a scenario.", 400);
  const view = (item.analysis as { scenario?: ScenarioView } | null)?.scenario;
  const key = parseJson<ScenarioKey>(item.model_answer);
  if (!view || !key) throw new SessionError("This scenario is incomplete.", 422);
  if (input.choice < 0 || input.choice >= view.options.length) throw new SessionError("Choose one of the actions.", 400);
  const stored = (item.analysis as { result?: ScenarioResult } | null)?.result;
  if (item.answered_at && stored) return stored;

  const correctChoice = input.choice === key.best_option;
  let evaluation: JustificationEvaluation;
  try {
    evaluation = (
      await evaluateJustification({
        materialTitle: session.title,
        situation: view.situation,
        question: view.question,
        chosen: view.options[input.choice],
        best: view.options[key.best_option],
        rationale: key.rationale,
        keyPoints: Array.isArray(item.key_points) ? (item.key_points as string[]) : [],
        justification: input.justification,
      })
    ).evaluation;
  } catch (error) {
    if (!isAiError(error)) throw error;
    evaluation = { justification_score: 50, strengths: [], gaps: [], feedback: "Tamari can't check this right now, so compare your reasoning with the rationale yourself." };
  }
  const score = scenarioScore(correctChoice, evaluation.justification_score);
  const isCorrect = correctChoice && evaluation.justification_score >= 40;
  const result: ScenarioResult = { chosen: input.choice, best: key.best_option, correctChoice, score, isCorrect, rationale: key.rationale, optionFeedback: key.option_feedback, evaluation };
  await recordItemResult(supabase, item, session, {
    response: `${view.options[input.choice]}\n\n${input.justification}`,
    analysis: { scenario: view, result } as unknown as Json,
    score,
    isCorrect,
    responseMs: input.responseMs,
    mistake: {
      question: `${view.situation}\n${view.question}`,
      correctAnswer: `${view.options[key.best_option]} — ${key.rationale}`,
      explanation: evaluation.feedback,
      errorType: correctChoice ? "misunderstood_concept" : "confused_concepts",
    },
  });
  return result;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export async function startCases(supabase: Client, userId: string, input: FlowStartInput): Promise<FlowStartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const count = Math.max(1, Math.min(4, Math.round(input.plannedMinutes / 12)));
  const generated = await generateCases({ materialTitle: context.material.title, chunks: context.chunks, student: context.student, count, focusConcepts: await weakConceptNames(context.material.id, 4) });
  if (generated.cases.length === 0) throw new SessionError("No cases could be written from this material.", 422);
  const sessionId = await openSession(supabase, userId, {
    method: "case_based",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "understand",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("case_based", context.material.title),
    state: { index: 0, provider: generated.provider },
  });
  const concepts = await conceptsFor(supabase, userId, context, generated.cases.map((entry) => entry.concept));
  await insertItems(
    supabase,
    generated.cases.map((entry, position) => {
      const view: CaseView = { title: entry.title, text: entry.case_text, task: entry.task };
      return {
        session_id: sessionId,
        user_id: userId,
        position,
        kind: "case" as const,
        concept_id: concepts.get(normalizeConceptName(entry.concept)) ?? null,
        prompt: entry.task,
        model_answer: JSON.stringify(entry.model),
        key_points: [] as unknown as Json,
        source_excerpt: null,
        analysis: { case: view } as unknown as Json,
      };
    }),
  );
  return { sessionId, redirect: `/study/${sessionId}` };
}

export function formatCaseAnswer(answer: CaseAnswer): string {
  return [`Problem: ${answer.problem}`, `Evidence: ${answer.evidence}`, `Possible solutions: ${answer.solutions}`, `Best solution: ${answer.best_solution}`, `Justification: ${answer.justification}`].join("\n");
}

export async function evaluateCaseItem(input: { itemId: string; answer: CaseAnswer; responseMs: number | null }): Promise<CaseResult> {
  const supabase = await createClient();
  const { item, session } = await loadOpenItem(supabase, input.itemId);
  if (item.kind !== "case") throw new SessionError("This item is not a case.", 400);
  const view = (item.analysis as { case?: CaseView } | null)?.case;
  const model = parseJson<CaseModel>(item.model_answer);
  if (!view || !model) throw new SessionError("This case is incomplete.", 422);
  const stored = (item.analysis as { evaluation?: CaseEvaluation } | null)?.evaluation;
  if (item.answered_at && stored) return { evaluation: stored, model, isCorrect: Boolean(item.is_correct) };

  const answer = Object.fromEntries(CASE_FIELDS.map((field) => [field, (input.answer[field] ?? "").trim().slice(0, 3000)])) as CaseAnswer;
  let evaluation: CaseEvaluation;
  try {
    evaluation = (await evaluateCaseAnalysis({ materialTitle: session.title, caseText: view.text, model, answer })).evaluation;
  } catch (error) {
    if (!isAiError(error)) throw error;
    const neutral = { score: 50, feedback: "Not checked — Tamari can't check this right now." };
    evaluation = { fields: { problem: neutral, evidence: neutral, solutions: neutral, best_solution: neutral, justification: neutral }, overall: 50, strengths: [], gaps: [], feedback: "Tamari can't check this right now, so compare your analysis with the expert one yourself." };
  }
  const isCorrect = evaluation.overall >= 60;
  await recordItemResult(supabase, item, session, {
    response: JSON.stringify(answer),
    analysis: { case: view, evaluation } as unknown as Json,
    score: evaluation.overall,
    isCorrect,
    responseMs: input.responseMs,
    mistake: { question: `${view.title}: ${view.task}`, correctAnswer: `Problem: ${model.problem}\nBest solution: ${model.best_solution}\nJustification: ${model.justification}`, explanation: evaluation.feedback, errorType: "misunderstood_concept" },
  });
  return { evaluation, model, isCorrect };
}
