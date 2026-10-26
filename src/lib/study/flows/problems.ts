import "server-only";

import { defaultDifficulty, difficultyTargets, weakConceptNames } from "@/lib/adaptive/engine";
import { isAiError } from "@/lib/ai";
import { normalizeConceptName } from "@/lib/concepts/service";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { conceptsFor, insertItems, loadOpenItem, openSession, recordItemResult, recordUngradedItem, reloadItem, type Client, type FlowStartInput, type FlowStartResult, type ItemRow, type MaterialContext } from "@/lib/study/items";
import {
  evaluateProblemAnswer,
  formatSolution,
  generateProblems,
  solutionSchema,
  type GeneratedProblem,
  type ProblemDifficulty,
  type ProblemEvaluation,
  type ProblemMode,
  type Solution,
  type SolutionStep,
} from "@/lib/study/prompts/problems";
import { FADE_LEVELS, fadeFormat, fadeSchedule, givenStepCount } from "@/lib/study/problem-options";
import { ungradedView, type UngradedView } from "@/lib/study/results";
import { SessionError, sessionTitle } from "@/lib/study/sessions";
import { PASS_SCORE } from "@/lib/study/verdict";
import type { Json, StudySessionItem } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Worked examples, faded worked examples and practice problems (§16).
 *
 * Every item is a `problem`: the reference solution lives in `model_answer`
 * (JSON) and the grading key points in `key_points`, both hidden from the
 * browser until the item is answered. What the student may see while working
 * — the worked example, or the steps a faded example gives away — is in
 * `analysis`.
 */

export type ProblemStartInput = FlowStartInput & { difficulty?: ProblemDifficulty | "adaptive" };

export type ProblemAnalysis = {
  concept?: string;
  difficulty?: ProblemDifficulty;
  worked?: { problem: string; solution: Solution };
  faded?: { level: number; givenSteps: SolutionStep[]; totalSteps: number; held?: boolean };
  evaluation?: ProblemEvaluation;
};

/** `evaluation` is null when Tamari couldn't check the working: the student marks it against the solution (`ungraded`). */
export type ProblemResult = { evaluation: ProblemEvaluation | null; solution: Solution | null; isCorrect: boolean | null; ungraded: UngradedView | null; heldNext: boolean };

export function parseSolution(value: string | null): Solution | null {
  if (!value) return null;
  try {
    const parsed = solutionSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function generate(context: MaterialContext, mode: ProblemMode, count: number, difficulty: ProblemDifficulty | "adaptive"): Promise<{ problems: GeneratedProblem[]; provider: string }> {
  const [targets, focus, fallback] = await Promise.all([
    difficulty === "adaptive" ? difficultyTargets(context.material.id) : Promise.resolve([]),
    weakConceptNames(context.material.id, 4),
    difficulty === "adaptive" ? defaultDifficulty() : Promise.resolve(undefined),
  ]);
  const generated = await generateProblems({ materialTitle: context.material.title, chunks: context.chunks, student: context.student, mode, count, difficulty, targets, fallback, focusConcepts: focus });
  if (generated.problems.length === 0) throw new SessionError("No problems could be written from this material.", 422);
  return generated;
}

async function baseRows(supabase: Client, userId: string, context: MaterialContext, sessionId: string, problems: GeneratedProblem[]): Promise<Array<Pick<ItemRow, "session_id" | "user_id" | "position" | "kind" | "concept_id">>> {
  const concepts = await conceptsFor(supabase, userId, context, problems.map((problem) => problem.concept));
  return problems.map((problem, position) => ({ session_id: sessionId, user_id: userId, position, kind: "problem" as const, concept_id: concepts.get(normalizeConceptName(problem.concept)) ?? null }));
}

export async function startWorkedExamples(supabase: Client, userId: string, input: ProblemStartInput): Promise<FlowStartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const count = Math.max(1, Math.min(4, Math.round(input.plannedMinutes / 10)));
  const generated = await generate(context, "worked", count, "adaptive");
  const problems = generated.problems.filter((problem) => problem.practice);
  if (problems.length === 0) throw new SessionError("No worked examples could be written from this material.", 422);
  const sessionId = await openSession(supabase, userId, {
    method: "worked_examples",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "practice",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("worked_examples", context.material.title),
    state: { index: 0, provider: generated.provider },
  });
  const base = await baseRows(supabase, userId, context, sessionId, problems);
  await insertItems(
    supabase,
    problems.map((problem, index) => {
      const practice = problem.practice!;
      const analysis: ProblemAnalysis = { concept: problem.concept, difficulty: problem.difficulty, worked: { problem: problem.problem, solution: problem.solution } };
      return {
        ...base[index],
        prompt: practice.problem,
        model_answer: JSON.stringify(practice.solution),
        key_points: practice.key_points as unknown as Json,
        source_excerpt: null,
        format: "worked",
        analysis: analysis as unknown as Json,
      };
    }),
  );
  return { sessionId, redirect: `/study/${sessionId}` };
}

export async function startFadedExamples(supabase: Client, userId: string, input: ProblemStartInput): Promise<FlowStartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const generated = await generate(context, "faded", FADE_LEVELS.length, "adaptive");
  const problems = generated.problems.slice(0, FADE_LEVELS.length);
  const levels = fadeSchedule(problems.length);
  const sessionId = await openSession(supabase, userId, {
    method: "faded_worked_examples",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "practice",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("faded_worked_examples", context.material.title),
    state: { index: 0, provider: generated.provider, levels },
  });
  const base = await baseRows(supabase, userId, context, sessionId, problems);
  let previousShare = 1;
  const rows: ItemRow[] = problems.map((problem, index) => {
    const level = levels[index];
    const total = problem.solution.steps.length;
    const given = givenStepCount(total, level, previousShare);
    previousShare = total ? given / total : 0;
    const analysis: ProblemAnalysis = { concept: problem.concept, difficulty: problem.difficulty, faded: { level, givenSteps: problem.solution.steps.slice(0, given), totalSteps: total } };
    return {
      ...base[index],
      prompt: problem.problem,
      model_answer: JSON.stringify(problem.solution),
      key_points: problem.key_points as unknown as Json,
      source_excerpt: null,
      format: fadeFormat(level),
      analysis: analysis as unknown as Json,
    };
  });
  await insertItems(supabase, rows);
  return { sessionId, redirect: `/study/${sessionId}` };
}

export async function startPracticeProblems(supabase: Client, userId: string, input: ProblemStartInput): Promise<FlowStartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const count = Math.max(3, Math.min(10, Math.round(input.plannedMinutes / 5)));
  const difficulty = input.difficulty ?? "adaptive";
  const generated = await generate(context, "practice", count, difficulty);
  const sessionId = await openSession(supabase, userId, {
    method: "practice_problems",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "practice",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("practice_problems", context.material.title),
    state: { index: 0, provider: generated.provider, difficulty },
  });
  const base = await baseRows(supabase, userId, context, sessionId, generated.problems);
  await insertItems(
    supabase,
    generated.problems.map((problem, index) => {
      const analysis: ProblemAnalysis = { concept: problem.concept, difficulty: problem.difficulty };
      return {
        ...base[index],
        prompt: problem.problem,
        model_answer: JSON.stringify(problem.solution),
        key_points: problem.key_points as unknown as Json,
        source_excerpt: null,
        format: problem.difficulty,
        analysis: analysis as unknown as Json,
      };
    }),
  );
  return { sessionId, redirect: `/study/${sessionId}` };
}

/** A struggling student keeps the same amount of help on the next faded example (§16 progressive difficulty). */
async function holdNextFade(supabase: Client, item: StudySessionItem, level: number): Promise<boolean> {
  const { data: next } = await supabase
    .from("study_session_items")
    .select("id, model_answer, analysis")
    .eq("session_id", item.session_id)
    .eq("kind", "problem")
    .is("answered_at", null)
    .gt("position", item.position)
    .order("position")
    .limit(1)
    .maybeSingle();
  const analysis = (next?.analysis as ProblemAnalysis | null) ?? null;
  const solution = parseSolution(next?.model_answer ?? null);
  if (!next || !analysis?.faded || !solution || analysis.faded.level >= level) return false;
  const given = givenStepCount(solution.steps.length, level);
  const faded = { level, givenSteps: solution.steps.slice(0, given), totalSteps: solution.steps.length, held: true };
  await supabase
    .from("study_session_items")
    .update({ analysis: { ...analysis, faded } as unknown as Json, format: fadeFormat(level) })
    .eq("id", next.id);
  return true;
}

/** Grades the student's working on one problem; the reference solution comes back only now. */
export async function evaluateProblemItem(input: { itemId: string; work: string; responseMs: number | null }): Promise<ProblemResult> {
  const supabase = await createClient();
  const { item, session } = await loadOpenItem(supabase, input.itemId);
  if (item.kind !== "problem") throw new SessionError("This item is not a problem.", 400);
  const solution = parseSolution(item.model_answer);
  const stored = (item.analysis as ProblemAnalysis | null) ?? {};
  if (item.answered_at) return storedProblemResult(item, solution);
  if (!solution) throw new SessionError("This problem has no reference solution.", 422);

  let evaluation: ProblemEvaluation | null;
  try {
    evaluation = (
      await evaluateProblemAnswer({
        materialTitle: session.title,
        problem: item.prompt,
        solution,
        keyPoints: Array.isArray(item.key_points) ? (item.key_points as string[]) : [],
        givenSteps: stored.faded?.givenSteps ?? [],
        work: input.work,
      })
    ).evaluation;
  } catch (error) {
    if (!isAiError(error)) throw error;
    evaluation = null;
  }
  const mistake = { question: item.prompt, correctAnswer: formatSolution(solution), explanation: evaluation?.feedback ?? "", errorType: evaluation?.error_type ?? ("unclassified" as const) };
  if (!evaluation) {
    // Tamari couldn't check the working: the solution is shown and the student marks it themselves.
    const recorded = await recordUngradedItem(supabase, item, session, { response: input.work, analysis: stored, responseMs: input.responseMs, mistake });
    if (!recorded) return storedProblemResult(await reloadItem(supabase, item.id), solution);
    return { evaluation: null, solution, isCorrect: null, ungraded: { selfCheck: null }, heldNext: false };
  }
  const isCorrect = evaluation.score >= PASS_SCORE.problem;
  const recorded = await recordItemResult(supabase, item, session, {
    response: input.work,
    analysis: { ...stored, evaluation } as unknown as Json,
    score: evaluation.score,
    isCorrect,
    responseMs: input.responseMs,
    mistake,
  });
  if (!recorded) return storedProblemResult(await reloadItem(supabase, item.id), solution);
  const heldNext = session.method === "faded_worked_examples" && evaluation.score < 50 && stored.faded ? await holdNextFade(supabase, item, stored.faded.level) : false;
  return { evaluation, solution, isCorrect, ungraded: null, heldNext };
}

/** The stored result of an answered problem. */
function storedProblemResult(item: StudySessionItem, solution: Solution | null): ProblemResult {
  const ungraded = ungradedView(item.analysis);
  const evaluation = (item.analysis as ProblemAnalysis | null)?.evaluation ?? null;
  if (!ungraded && !evaluation) throw new SessionError("This problem is already being checked.", 409);
  return { evaluation: ungraded ? null : evaluation, solution, isCorrect: item.is_correct, ungraded, heldNext: false };
}
