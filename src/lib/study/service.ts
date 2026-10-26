import "server-only";

import { weakConceptNames as masteryWeakConcepts } from "@/lib/adaptive/engine";
import { markSmartBlock, startSmartSession } from "@/lib/adaptive/smart";
import { ensureConcepts, normalizeConceptName } from "@/lib/concepts/service";
import { isAiError } from "@/lib/ai";
import { choiceComparison, retestViewOf } from "@/lib/mistakes/retest";
import { createQuiz, startAttempt } from "@/lib/quizzes/service";
import { QUESTION_TYPE_IDS } from "@/lib/quizzes/types";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { startBlurting, startChunking, startCumulativeReview, startInterleaving, startQuestionGeneration, startRapidReview, startRetrievalPractice } from "@/lib/study/advanced";
import { startCases, startScenarios } from "@/lib/study/flows/applied";
import { startGuidedReading } from "@/lib/study/flows/reading";
import { startConceptMapping, startMindMapping } from "@/lib/study/flows/maps";
import { startMemoryPalace, startMnemonics, startStories } from "@/lib/study/flows/memory";
import { startPreTesting } from "@/lib/study/flows/pretest";
import { startDualCoding } from "@/lib/study/flows/visual";
import { startFadedExamples, startPracticeProblems, startWorkedExamples } from "@/lib/study/flows/problems";
import { analyzeFeynmanExplanation, compareRecallAnswer, generateRecallQuestions, pickFeynmanConcepts, type FeynmanAnalysis, type RecallComparison } from "@/lib/study/ai";
import { isTutorMethod, METHOD_BEHAVIOR, TEST_METHOD_IDS, type BuilderMethodId, type TestMethodId } from "@/lib/study/catalog";
import { signatureForStart, startUnlessDuplicate, type SessionDuplicate } from "@/lib/study/duplicates";
import { activeSeconds } from "@/lib/study/focus";
import { insertItems, loadOpenItem, recordItemResult, recordUngradedItem, reloadItem, retestOutcomeFor, settleAnsweredItem, storeItemAttempt } from "@/lib/study/items";
import { mistakesToRetest, retestItem } from "@/lib/study/retests";
import type { StudyMethodId } from "@/lib/study/methods";
import type { ProblemDifficulty } from "@/lib/study/prompts/problems";
import { completeSession, createSession, loadSession, SessionError, sessionTitle, suggestNext, updateSessionState, type SessionSummary } from "@/lib/study/sessions";
import { recallResultOf, ungradedView, type RecallItemResult, type UngradedView } from "@/lib/study/results";
import { countsAsCorrect, PASS_SCORE } from "@/lib/study/verdict";
import type { ConfidenceLevel, Json, SessionGoal, StudySession, StudySessionItem } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { startTutorSession } from "@/lib/tutor/service";

type Client = Awaited<ReturnType<typeof createClient>>;

export type StartSessionInput = {
  method: BuilderMethodId;
  materialId: string | null;
  /** Interleaving: the other materials to mix with `materialId`. */
  materialIds?: string[];
  goal: SessionGoal | null;
  plannedMinutes: number;
  /** Practice testing only. */
  questionCount?: number;
  timed?: boolean;
  /** Practice testing only: the topic or concepts the test should stay on. */
  focus?: string | null;
  /** Active recall and Feynman: the concepts to ask about first (a plan block's fading or weak concepts); else the weakest ones. */
  focusConcepts?: string[];
  /** Practice problems only. */
  problemDifficulty?: ProblemDifficulty | "adaptive";
  /** Dual coding only: draw new visuals instead of reusing the saved set. */
  freshVisuals?: boolean;
  /** Mind / concept mapping only: draw a new map instead of opening the saved one. */
  freshMap?: boolean;
  /** Mnemonics only: practice the student's saved mnemonics instead of writing new ones. */
  savedMnemonics?: boolean;
  /** Pomodoro only. */
  workMinutes?: number;
  breakMinutes?: number;
  topic?: string | null;
  /** Set when the session is one block of a smart session. */
  parentSessionId?: string | null;
  parentBlockKey?: string | null;
  /** Set when the session was started from a planner task; completing it closes the task. */
  taskId?: string | null;
  /** Start even though an unfinished session like it exists (the student chose "Start a new one"). */
  allowDuplicate?: boolean;
};

export type StartSessionResult = { sessionId: string; redirect: string };

/** Recall prompts per planned minute: about two minutes each, 3-15 items. */
function recallCount(minutes: number): number {
  return Math.max(3, Math.min(15, Math.round(minutes / 2)));
}

function feynmanCount(minutes: number): number {
  return Math.max(1, Math.min(4, Math.round(minutes / 8)));
}

/**
 * The material's concepts that need work, for a generator to start with. Only this material's: a new
 * material has none yet, and the weak spots of another subject don't belong in its prompts.
 */
function weakConceptNames(materialId: string, limit = 6): Promise<string[]> {
  return masteryWeakConcepts(materialId, limit);
}

/**
 * Starts a session of the chosen method: generates its items (active recall,
 * Feynman), gathers open mistakes (error review), creates a quiz and attempt
 * (practice testing) or just records the timer settings (Pomodoro). When the
 * student already has an unfinished session like it, nothing starts and the
 * answer says so (duplicates.ts), unless `allowDuplicate` asks for another.
 */
export async function startSession(userId: string, input: StartSessionInput): Promise<StartSessionResult | SessionDuplicate> {
  // Flashcard reviews only open their page here; the review page starts (and checks) the session itself.
  if (input.method === "flashcards" || input.method === "spaced_repetition" || input.parentSessionId || input.taskId) return startPlannedSession(userId, input);
  const supabase = await createClient();
  return startUnlessDuplicate(supabase, userId, signatureForStart(input), Boolean(input.allowDuplicate), () => startPlannedSession(userId, input));
}

/**
 * Starts a session without looking for unfinished copies: a block of a plan or a planner task's session,
 * which their plan or task opens again while it is unfinished, so there is nothing to ask.
 */
export async function startPlannedSession(userId: string, input: StartSessionInput): Promise<StartSessionResult> {
  const result = await startSessionInner(userId, input);
  if (input.parentSessionId && result.sessionId) {
    const supabase = await createClient();
    await updateSessionState(supabase, result.sessionId, { parentId: input.parentSessionId });
    if (input.parentBlockKey) await markSmartBlock(input.parentSessionId, input.parentBlockKey, { childSessionId: result.sessionId, status: "in_progress" });
  }
  if (input.taskId && result.sessionId) {
    const supabase = await createClient();
    await updateSessionState(supabase, result.sessionId, { taskId: input.taskId });
    await supabase.from("study_tasks").update({ session_id: result.sessionId }).eq("id", input.taskId).eq("status", "pending");
  }
  return result;
}

async function startSessionInner(userId: string, input: StartSessionInput): Promise<StartSessionResult> {
  const supabase = await createClient();
  const behavior = METHOD_BEHAVIOR[input.method];
  if (behavior.requiresMaterial && !input.materialId) throw new SessionError("Choose a material for this method.", 400);

  if (input.method === "smart_study") {
    if (input.materialId) {
      const { data: material } = await supabase.from("materials").select("status").eq("id", input.materialId).maybeSingle();
      if (!material) throw new SessionError("Material not found.", 404);
      if (material.status === "deleted") throw new SessionError("The file behind this material was deleted, so it can't be studied from anymore. What you made from it before is still here.", 410);
      if (material.status !== "ready") throw new SessionError("This material has not finished processing yet.", 409);
    }
    const { sessionId } = await startSmartSession(userId, { materialId: input.materialId, goal: input.goal, minutes: input.plannedMinutes });
    return { sessionId, redirect: `/study/${sessionId}` };
  }

  if (isTutorMethod(input.method)) {
    const context = await loadMaterialContext(supabase, input.materialId!);
    const result = await startTutorSession(userId, {
      method: input.method,
      materialId: context.material.id,
      goal: input.goal,
      plannedMinutes: input.plannedMinutes,
      materialTitle: context.material.title,
    });
    return { sessionId: result.sessionId, redirect: `/tutor/${result.conversationId}` };
  }

  switch (input.method) {
    case "active_recall":
      return startRecallSession(supabase, userId, input);
    case "feynman":
      return startFeynmanSession(supabase, userId, input);
    case "error_review":
      return startErrorReviewSession(supabase, userId, input);
    case "practice_testing":
    case "mixed_practice":
    case "exam_simulation":
      return startPracticeTesting(supabase, userId, input, input.method);
    case "pomodoro":
      return startPomodoro(supabase, userId, input);
    case "spaced_repetition":
      return { sessionId: "", redirect: "/flashcards/review" };
    case "flashcards":
      return { sessionId: "", redirect: input.materialId ? `/flashcards?material=${input.materialId}` : "/flashcards" };
    case "retrieval_practice":
      return startRetrievalPractice(supabase, userId, input);
    case "rapid_review":
      return startRapidReview(supabase, userId, input);
    case "cumulative_review":
      return startCumulativeReview(supabase, userId, input);
    case "interleaving":
      return startInterleaving(supabase, userId, input);
    case "blurting":
      return startBlurting(supabase, userId, input);
    case "chunking":
      return startChunking(supabase, userId, input);
    case "question_generation":
      return startQuestionGeneration(supabase, userId, input);
    case "worked_examples":
      return startWorkedExamples(supabase, userId, input);
    case "faded_worked_examples":
      return startFadedExamples(supabase, userId, input);
    case "practice_problems":
      return startPracticeProblems(supabase, userId, { ...input, difficulty: input.problemDifficulty });
    case "scenario_based":
      return startScenarios(supabase, userId, input);
    case "case_based":
      return startCases(supabase, userId, input);
    case "sq3r":
    case "pq4r":
    case "cornell_notes":
      return startGuidedReading(supabase, userId, input, input.method);
    case "dual_coding":
      return startDualCoding(supabase, userId, input);
    case "mind_mapping":
      return startMindMapping(supabase, userId, input);
    case "concept_mapping":
      return startConceptMapping(supabase, userId, input);
    case "mnemonics":
      return startMnemonics(supabase, userId, input);
    case "memory_palace":
      return startMemoryPalace(supabase, userId, input);
    case "story_method":
      return startStories(supabase, userId, input);
    case "pre_testing":
      return startPreTesting(supabase, userId, input);
  }
}

async function startRecallSession(supabase: Client, userId: string, input: StartSessionInput): Promise<StartSessionResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const [weak, { data: mistakes }] = await Promise.all([
    input.focusConcepts?.length ? Promise.resolve(input.focusConcepts.slice(0, 6)) : weakConceptNames(context.material.id),
    supabase.from("mistakes").select("question_text").eq("material_id", context.material.id).is("resolved_at", null).order("created_at", { ascending: false }).limit(5),
  ]);
  const count = recallCount(input.plannedMinutes);
  const generated = await generateRecallQuestions({
    materialTitle: context.material.title,
    chunks: context.chunks,
    count,
    focusConcepts: weak,
    recentMistakes: (mistakes ?? []).map((mistake) => mistake.question_text.slice(0, 200)),
    student: context.student,
    knownConcepts: context.knownConcepts,
  });
  if (generated.questions.length === 0) throw new SessionError("No recall prompts could be written from this material.", 422);

  const concepts = await ensureConcepts(supabase, userId, generated.questions.map((question) => question.concept), {
    materialId: context.material.id,
    subjectId: context.material.subject_id,
  });
  const { id } = await createSession(supabase, userId, {
    method: "active_recall",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal,
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("active_recall", context.material.title),
    state: { index: 0, provider: generated.provider },
  });
  const { error } = await supabase.from("study_session_items").insert(
    generated.questions.map((question, position) => ({
      session_id: id,
      user_id: userId,
      position,
      kind: "recall" as const,
      concept_id: concepts.get(normalizeConceptName(question.concept)) ?? null,
      prompt: question.prompt,
      model_answer: question.model_answer,
      key_points: question.key_points as unknown as Json,
      source_excerpt: question.source_excerpt || null,
    })),
  );
  if (error) throw new Error(`study_session_items: insert failed: ${error.message}`);
  return { sessionId: id, redirect: `/study/${id}` };
}

async function startFeynmanSession(supabase: Client, userId: string, input: StartSessionInput): Promise<StartSessionResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const weak = input.focusConcepts?.length ? input.focusConcepts.slice(0, 6) : await weakConceptNames(context.material.id);
  const generated = await pickFeynmanConcepts({
    materialTitle: context.material.title,
    chunks: context.chunks,
    count: feynmanCount(input.plannedMinutes),
    focusConcepts: weak,
    student: context.student,
    knownConcepts: context.knownConcepts,
  });
  if (generated.concepts.length === 0) throw new SessionError("No explainable concepts were found in this material.", 422);
  const concepts = await ensureConcepts(supabase, userId, generated.concepts.map((item) => item.concept), {
    materialId: context.material.id,
    subjectId: context.material.subject_id,
  });
  const { id } = await createSession(supabase, userId, {
    method: "feynman",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal,
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("feynman", context.material.title),
    state: { index: 0, provider: generated.provider },
  });
  const { error } = await supabase.from("study_session_items").insert(
    generated.concepts.map((item, position) => ({
      session_id: id,
      user_id: userId,
      position,
      kind: "feynman" as const,
      concept_id: concepts.get(normalizeConceptName(item.concept)) ?? null,
      prompt: item.concept,
      model_answer: item.ideal_explanation,
      key_points: item.key_points as unknown as Json,
      source_excerpt: item.source_excerpt || null,
    })),
  );
  if (error) throw new Error(`study_session_items: insert failed: ${error.message}`);
  return { sessionId: id, redirect: `/study/${id}` };
}

async function startErrorReviewSession(supabase: Client, userId: string, input: StartSessionInput): Promise<StartSessionResult> {
  const mistakes = await mistakesToRetest(supabase, { materialId: input.materialId, limit: recallCount(input.plannedMinutes) });
  if (mistakes.length === 0) throw new SessionError("Your mistake notebook has nothing open to retest.", 422);

  const materialTitle = input.materialId ? (mistakes[0].material?.title ?? null) : null;
  const { id } = await createSession(supabase, userId, {
    method: "error_review",
    materialId: input.materialId,
    goal: input.goal,
    plannedMinutes: input.plannedMinutes,
    title: materialTitle ? `${materialTitle} — Error Review` : "Error Review — mistake notebook",
    state: { index: 0 },
  });
  await insertItems(supabase, mistakes.map((mistake, position) => retestItem(mistake, { sessionId: id, userId, position })));
  return { sessionId: id, redirect: `/study/${id}` };
}

/**
 * Practice testing, mixed practice (every question type, shuffled) and exam
 * simulation (exam mode: timer, random order, no hints, auto-submit) all run
 * through the quiz runner.
 */
async function startPracticeTesting(supabase: Client, userId: string, input: StartSessionInput, method: TestMethodId = "practice_testing"): Promise<StartSessionResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const questionCount = Math.max(3, Math.min(50, input.questionCount ?? 10));
  const exam = method === "exam_simulation";
  const timed = exam || Boolean(input.timed);
  const quiz = await createQuiz(context.material.id, {
    questionTypes: method === "mixed_practice" ? [...QUESTION_TYPE_IDS] : ["multiple_choice", "identification", "true_false", "short_answer"],
    questionCount,
    difficulty: "adaptive",
    mode: exam ? "exam" : "practice",
    timeLimitMinutes: timed ? input.plannedMinutes : null,
    shuffleQuestions: true,
    shuffleOptions: true,
    feedback: "after",
    focus: input.focus?.trim() || null,
    askConfidence: true,
  });
  if (quiz.status !== "ready") throw new SessionError(quiz.detail ?? "The practice test could not be generated.", 422);
  const attempt = await startAttempt(quiz.id, { mode: exam ? "exam" : "practice", timeLimitMinutes: timed ? input.plannedMinutes : null });
  const { id } = await createSession(supabase, userId, {
    method,
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal,
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle(method, context.material.title),
    state: { quizId: quiz.id, attemptId: attempt.id, timed, questionCount, mode: exam ? "exam" : "practice" },
  });
  await supabase.from("study_sessions").update({ quiz_attempt_id: attempt.id }).eq("id", id);
  return { sessionId: id, redirect: `/quiz/${quiz.id}/attempt/${attempt.id}?session=${id}` };
}

async function startPomodoro(supabase: Client, userId: string, input: StartSessionInput): Promise<StartSessionResult> {
  let materialTitle: string | null = null;
  let subjectId: string | null = null;
  if (input.materialId) {
    const { data: material } = await supabase.from("materials").select("title, subject_id").eq("id", input.materialId).maybeSingle();
    if (!material) throw new SessionError("Material not found.", 404);
    materialTitle = material.title;
    subjectId = material.subject_id;
  }
  const workMinutes = Math.max(1, Math.min(120, input.workMinutes ?? 25));
  const breakMinutes = Math.max(1, Math.min(60, input.breakMinutes ?? 5));
  const topic = input.topic?.trim().slice(0, 120) || materialTitle;
  const { id } = await createSession(supabase, userId, {
    method: "pomodoro",
    materialId: input.materialId,
    subjectId,
    goal: input.goal,
    plannedMinutes: input.plannedMinutes,
    title: topic ? `${topic} — Pomodoro` : "Pomodoro",
    state: { workMinutes, breakMinutes, longBreakMinutes: Math.max(10, breakMinutes * 3), completedRounds: 0, phase: "idle", focusSeconds: 0, topic },
  });
  return { sessionId: id, redirect: `/study/${id}` };
}

// ---------------------------------------------------------------------------
// Recall / error-review items
// ---------------------------------------------------------------------------

export type { RecallItemResult } from "@/lib/study/results";

/** Item kinds answered through the recall comparison (the other kinds have their own flows). */
const RECALL_FLOW_KINDS: ReadonlyArray<StudySessionItem["kind"]> = ["recall", "mistake", "chunk", "stage"];

/**
 * Compares a recall answer with the model answer and stores the result; wrong answers go to the notebook. A
 * retest of a notebook entry answered by picking one of its choices is checked against the right choice.
 */
export async function answerRecallItem(input: { itemId: string; response: string; confidence: ConfidenceLevel | null; responseMs: number | null }): Promise<RecallItemResult> {
  const supabase = await createClient();
  const { item, session } = await loadOpenItem(supabase, input.itemId);
  if (!RECALL_FLOW_KINDS.includes(item.kind) || (item.kind === "stage" && item.format === "summary")) throw new SessionError("This item uses a different flow.", 400);
  if (item.answered_at) return storedRecallResult(item);

  const retest = item.kind === "mistake" && item.source_mistake_id ? item.source_mistake_id : null;
  const view = item.kind === "mistake" ? retestViewOf(item.analysis) : { choices: null, context: null };
  const keyPoints = Array.isArray(item.key_points) ? (item.key_points as string[]) : [];
  let comparison: RecallComparison | null;
  if (view.choices) {
    comparison = choiceComparison(input.response, item.model_answer ?? "");
  } else {
    try {
      const result = await compareRecallAnswer({
        materialTitle: session.title,
        // A retest's case or situation is part of the question.
        prompt: view.context ? `${view.context}\n\n${item.prompt}` : item.prompt,
        modelAnswer: item.model_answer ?? "",
        keyPoints,
        studentAnswer: input.response,
        format: item.format,
      });
      comparison = result.comparison;
    } catch (error) {
      if (!isAiError(error)) throw error;
      comparison = null;
    }
  }
  // Items keep what they carried before the answer (a chunk's reading text, a guided-reading question's section, a retest's choices).
  const carried = (item.analysis && typeof item.analysis === "object" && !Array.isArray(item.analysis) ? item.analysis : {}) as Record<string, unknown>;
  const result = { modelAnswer: item.model_answer ?? "", sourceExcerpt: item.source_excerpt };
  if (!comparison) {
    // Tamari couldn't check it: the student sees the model answer and marks the answer themselves.
    const stored = await recordUngradedItem(supabase, item, session, {
      response: input.response,
      analysis: carried,
      confidence: input.confidence,
      responseMs: input.responseMs,
      retestedMistakeId: retest,
      mistake: retest ? null : { question: item.prompt, correctAnswer: item.model_answer ?? "", explanation: "" },
    });
    if (!stored) return storedRecallResult(await reloadItem(supabase, item.id));
    return { comparison: null, isCorrect: null, ungraded: { selfCheck: null }, ...result, retest: null };
  }
  const isCorrect = countsAsCorrect(comparison.verdict);
  // A retested mistake is learned when answered right on a later day than its last miss, and otherwise stays
  // open; any other wrong answer is filed.
  const outcome = retest ? await retestOutcomeFor(supabase, retest, isCorrect) : null;
  const stored = await recordItemResult(supabase, item, session, {
    response: input.response,
    analysis: { ...carried, ...comparison, ...(outcome ? { retestOutcome: outcome } : {}) } as unknown as Json,
    score: comparison.score,
    isCorrect,
    confidence: input.confidence,
    responseMs: input.responseMs,
    retestedMistakeId: retest,
    retestOutcome: outcome,
    mistake: retest ? null : { question: item.prompt, correctAnswer: item.model_answer ?? "", explanation: comparison.feedback },
  });
  // A double submit (or a second tab) answered first: its answer stands.
  if (!stored) return storedRecallResult(await reloadItem(supabase, item.id));
  return { comparison, isCorrect, ungraded: null, ...result, retest: outcome };
}

/** The result of a recall item that is already answered. */
function storedRecallResult(item: StudySessionItem): RecallItemResult {
  const result = recallResultOf(item);
  if (!result) throw new SessionError("This item is already answered.", 409);
  return result;
}

// ---------------------------------------------------------------------------
// Feynman items
// ---------------------------------------------------------------------------

export type FeynmanRoundResult = {
  /**
   * null when Tamari couldn't check this attempt; it ends the concept either way. A first attempt is then
   * marked by the student (`ungraded`); after a checked first attempt, that check stands (`ungraded` null).
   */
  analysis: FeynmanAnalysis | null;
  round: number;
  final: boolean;
  ungraded: UngradedView | null;
  idealExplanation: string | null;
  sourceExcerpt: string | null;
};

export const FEYNMAN_MAX_ROUNDS = 2;

/**
 * Analyses one explanation attempt (`round`: the attempt the student is on, 1 or 2); the ideal explanation is
 * revealed only after the last round.
 */
export async function analyzeFeynmanItem(input: { itemId: string; explanation: string; responseMs: number | null; round: number }): Promise<FeynmanRoundResult> {
  const supabase = await createClient();
  const { item, session } = await loadOpenItem(supabase, input.itemId);
  if (item.kind !== "feynman") throw new SessionError("This item is not a Feynman concept.", 400);
  // That attempt is already stored (a double submit, or a second tab, got there first): it stands. Otherwise
  // a late copy of the first explanation was analysed as the improved one and used up the second attempt,
  // and a late copy of the second showed an error instead of the result.
  if (item.answered_at || item.attempts >= input.round) return storedFeynmanRound(item);
  if (item.attempts >= FEYNMAN_MAX_ROUNDS) throw new SessionError("This concept has already had two attempts.", 409);

  const round = item.attempts + 1;
  const keyPoints = Array.isArray(item.key_points) ? (item.key_points as string[]) : [];
  let analysis: FeynmanAnalysis | null;
  try {
    const result = await analyzeFeynmanExplanation({
      materialTitle: session.title,
      concept: item.prompt,
      idealExplanation: item.model_answer ?? "",
      keyPoints,
      explanation: input.explanation,
      round,
    });
    analysis = result.analysis;
  } catch (error) {
    if (!isAiError(error)) throw error;
    analysis = null;
  }
  const now = new Date().toISOString();
  const previous = ((item.analysis as unknown as { rounds?: unknown[] } | null)?.rounds ?? []) as Array<FeynmanAnalysis & { round: number }>;
  const responseMs = (item.response_ms ?? 0) + (input.responseMs ?? 0);
  const reveal = { idealExplanation: item.model_answer, sourceExcerpt: item.source_excerpt };
  const mistake = (explanation: string) => ({ question: `Explain ${item.prompt} to a beginner.`, correctAnswer: item.model_answer ?? "", explanation, errorType: "misunderstood_concept" as const });
  if (!analysis) {
    const earlier = previous[previous.length - 1];
    if (!earlier) {
      // Without a check there is no feedback to improve on: this attempt ends the concept, the ideal
      // explanation is shown and the student marks their explanation against it.
      const stored = await recordUngradedItem(supabase, item, session, { response: input.explanation, analysis: { rounds: [], final: true }, responseMs, mistake: mistake("") });
      if (!stored) return storedFeynmanRound(await reloadItem(supabase, item.id));
      return { analysis: null, round, final: true, ungraded: { selfCheck: null }, ...reveal };
    }
    // The improved explanation couldn't be checked: the first attempt's check stands.
    const isCorrect = earlier.score >= PASS_SCORE.feynman;
    const stored = await storeItemAttempt(supabase, item, { response: input.explanation.slice(0, 8000), analysis: { rounds: previous, final: true } as unknown as Json, is_correct: isCorrect, score: earlier.score, response_ms: responseMs, answered_at: now });
    if (!stored) return storedFeynmanRound(await reloadItem(supabase, item.id));
    await settleAnsweredItem(supabase, item, session, { isCorrect, response: input.explanation, mistake: mistake(earlier.feedback) });
    return { analysis: null, round, final: true, ungraded: null, ...reveal };
  }
  const final = round >= FEYNMAN_MAX_ROUNDS || analysis.score >= 85;
  const isCorrect = analysis.score >= PASS_SCORE.feynman;
  const stored = await storeItemAttempt(supabase, item, {
    response: input.explanation.slice(0, 8000),
    analysis: { rounds: [...previous, { round, ...analysis }], final } as unknown as Json,
    is_correct: isCorrect,
    score: analysis.score,
    response_ms: responseMs,
    answered_at: final ? now : null,
  });
  // A double submit (or a second tab) stored this round first: its round stands.
  if (!stored) return storedFeynmanRound(await reloadItem(supabase, item.id));

  if (final) {
    await settleAnsweredItem(supabase, item, session, { isCorrect, response: input.explanation, mistake: mistake(analysis.feedback) });
  } else {
    await supabase.from("study_sessions").update({ last_active_at: now }).eq("id", session.id);
  }

  return { analysis, round, final, ungraded: null, idealExplanation: final ? reveal.idealExplanation : null, sourceExcerpt: final ? reveal.sourceExcerpt : null };
}

/** The latest stored round of a Feynman item. */
function storedFeynmanRound(item: StudySessionItem): FeynmanRoundResult {
  const final = Boolean(item.answered_at);
  const reveal = { idealExplanation: final ? item.model_answer : null, sourceExcerpt: final ? item.source_excerpt : null };
  const ungraded = ungradedView(item.analysis);
  if (ungraded && final) return { analysis: null, round: item.attempts, final, ungraded, ...reveal };
  const rounds = (item.analysis as unknown as { rounds?: Array<FeynmanAnalysis & { round: number }> } | null)?.rounds ?? [];
  const last = rounds[rounds.length - 1];
  if (!last) throw new SessionError("This explanation is already being checked.", 409);
  const { round, ...analysis } = last;
  return { analysis, round, final, ungraded: null, ...reveal };
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

async function nextFlashcardDue(supabase: Client): Promise<string | null> {
  const { data } = await supabase
    .from("flashcards")
    .select("due_at")
    .eq("suspended", false)
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.due_at ?? null;
}

/** Suggested next activity after an item-based session (§29). */
function itemSessionNext(method: StudyMethodId, accuracy: number | null, weak: string[]): string {
  switch (method) {
    case "error_review":
      // A retest clears a mistake only on a later day than the miss (lib/mistakes/retest.ts), so "learned" isn't promised here.
      return accuracy !== null && accuracy >= 0.8 ? "You got most of them right. Right answers to mistakes from earlier days cleared them from your notebook; today's misses stay until you get them right on another day." : suggestNext(accuracy, weak, "active_recall");
    case "blurting":
      return accuracy !== null && accuracy >= 0.8 ? "Strong recall after reading. Blurt again in three days to check it held." : weak[0] ? `Re-read the section on ${weak[0]}, then blurt it again tomorrow before looking.` : "Re-read the sections you forgot, then blurt them again tomorrow.";
    case "question_generation":
      return accuracy !== null && accuracy >= 0.8 ? "Your questions are exam-quality. Answer them yourself in a recall session tomorrow." : "Rewrite the lower-rated questions using the improved versions, then try answering them from memory.";
    case "worked_examples":
      return accuracy !== null && accuracy >= 0.8 ? "You can follow the method on your own. Try faded worked examples next so you rely less on the steps." : "Study the worked steps again, then retry the similar problems you missed.";
    case "faded_worked_examples":
      // After a struggle the help fades more slowly, so a session may end before a problem done alone.
      return accuracy !== null && accuracy >= 0.8 ? "You can follow the method with less and less help. Next, try practice problems on your own at a harder level." : "Repeat the faded examples; keep the steps you missed in view until you can solve one on your own.";
    case "mind_mapping":
      return accuracy === null ? "Quiz yourself on a branch next time — the questions show which parts of the map you really know." : accuracy >= 0.8 ? "You know these branches. Extend the map with the next chapter and quiz the new branches." : "Re-read the branches you missed on the map, then quiz them again tomorrow.";
    case "concept_mapping":
      return accuracy === null ? "Test the links next time to check you can name each relationship from memory." : accuracy >= 0.8 ? "You can name the relationships. Add the concepts of the next chapter and connect them." : "Study the relationships you missed, then test the links again tomorrow.";
    case "mnemonics":
      return accuracy !== null && accuracy >= 0.8 ? "Your mnemonics work. Practice the saved ones again in three days, before you look at the lists." : "Practice the lists you missed again tomorrow — if a device does not stick, write your own and save it.";
    case "memory_palace":
      return accuracy === null ? "Walk the route next time — naming what sits at each stop is what makes the palace work." : accuracy >= 0.8 ? "Your palace holds. Walk it again in three days without looking at the images first." : "Look at the images for the stops you missed, picture them at their places, then walk the route again tomorrow.";
    case "story_method":
      return accuracy !== null && accuracy >= 0.8 ? "Your retellings kept the facts. Retell the stories again in three days, before you reread them." : "Read the original notes beside the story for the facts you dropped, then retell it again tomorrow.";
    case "dual_coding":
      return accuracy !== null && accuracy >= 0.8 ? "You can rebuild these visuals from memory. Sketch one yourself next time before you look." : "Study the visuals you missed in the Combined view, then rebuild them again tomorrow.";
    case "sq3r":
    case "pq4r":
      return accuracy !== null && accuracy >= 0.8 ? "You can recite this chapter. Schedule the 1-3-7-14 reviews so it stays." : "Re-read the sections behind the questions you missed, then recite them again tomorrow.";
    case "cornell_notes":
      return accuracy !== null && accuracy >= 0.8 ? "Your cues bring the notes back. Cover the notes and answer the cues again in a few days." : "Re-read the sections behind the cues you missed, then cover your notes and answer the cues again tomorrow.";
    case "scenario_based":
      return accuracy !== null && accuracy >= 0.8 ? "Good judgment. Try a case-based session for longer, multi-step situations." : "Re-read the rationale for the scenarios you missed, then try new scenarios tomorrow.";
    case "case_based":
      return accuracy !== null && accuracy >= 0.8 ? "Strong case analysis. Test it under time pressure with an exam simulation." : "Compare your analysis with the expert one field by field; look first at the evidence you missed.";
    case "practice_problems":
      return accuracy !== null && accuracy >= 0.8 ? "Strong problem solving. Raise the difficulty next time (hard or challenge)." : weak[0] ? `Review the solutions for ${weak[0]}, then try a worked-example session on it.` : "Review the solutions you missed, then try a worked-example session.";
    case "retrieval_practice":
    case "rapid_review":
    case "cumulative_review":
    case "interleaving":
    case "chunking":
      return suggestNext(accuracy, weak, "active_recall");
    default:
      return suggestNext(accuracy, weak, method);
  }
}

/**
 * Closes an item-based session (the recall-style methods, Feynman, error review and the other item flows)
 * with its summary. Its focus time is the time spent answering (activeSeconds), or the browser's figure when
 * that is lower.
 */
export async function completeItemSession(sessionId: string, focusSeconds: number | null, abandoned = false): Promise<SessionSummary> {
  const supabase = await createClient();
  const session = await loadSession(supabase, sessionId);
  const { data: items } = await supabase
    .from("study_session_items")
    .select("prompt, is_correct, score, answered_at, concept:concepts!study_session_items_concept_fk(name)")
    .eq("session_id", sessionId)
    .order("position");
  const answered = (items ?? []).filter((item) => item.answered_at);
  // An answer Tamari couldn't check, and the student didn't mark, is neither right nor wrong: left out of the counts.
  const graded = answered.filter((item) => item.is_correct !== null);
  const ungraded = answered.length - graded.length;
  // Question generation keeps the average quality of the student's questions for the summary page.
  const scores = answered.map((item) => item.score).filter((score): score is number => typeof score === "number");
  const averageQuality = session.method === "question_generation" && scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  const extra = averageQuality !== null || ungraded > 0 ? { ...(averageQuality !== null ? { averageQuality } : {}), ...(ungraded > 0 ? { ungraded } : {}) } : undefined;
  const byConcept = new Map<string, { correct: number; total: number }>();
  for (const item of graded) {
    const name = (item.concept as unknown as { name: string } | null)?.name ?? item.prompt.slice(0, 40);
    const entry = byConcept.get(name) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (item.is_correct) entry.correct += 1;
    byConcept.set(name, entry);
  }
  const correct = graded.filter((item) => item.is_correct).length;
  // A question the student wrote is rated for its quality: a weak question doesn't make its concept weak.
  const ratesQuestions = session.method === "question_generation";
  const weak = ratesQuestions ? [] : [...byConcept.entries()].filter(([, value]) => value.correct < value.total).map(([name]) => name);
  const strong = ratesQuestions ? [] : [...byConcept.entries()].filter(([, value]) => value.correct === value.total && value.total > 0).map(([name]) => name);
  const accuracy = graded.length ? correct / graded.length : null;
  const method = session.method as StudyMethodId;
  // Building and editing a map is the session's work: without a quiz there is still the map's own advice.
  const mapOnly = answered.length === 0 && (method === "mind_mapping" || method === "concept_mapping");
  const studied = activeSeconds(session.started_at, (items ?? []).map((item) => item.answered_at));
  return completeSession(supabase, sessionId, {
    focusSeconds: Math.min(studied, focusSeconds ?? studied),
    topics: [...byConcept.keys()],
    questionsAnswered: graded.length,
    correct,
    incorrect: graded.length - correct,
    weakConcepts: weak,
    strongConcepts: strong,
    suggestedNext:
      answered.length === 0 && !mapOnly
        ? "Nothing was answered this time. Try a shorter session so it is easy to finish."
        : graded.length === 0 && !mapOnly
          ? "Tamari couldn't check these answers, so they aren't counted. Repeat this session later to track your progress."
          : itemSessionNext(method, accuracy, weak),
    nextReviewAt: await nextFlashcardDue(supabase),
    abandoned,
    extra,
  });
}

/** Stores Pomodoro progress (phase, rounds, focus seconds) so a refresh restores it. */
export async function savePomodoro(sessionId: string, state: Record<string, unknown>, focusSeconds: number): Promise<void> {
  const supabase = await createClient();
  await updateSessionState(supabase, sessionId, state, { focusSeconds });
}

export async function completePomodoro(sessionId: string, focusSeconds: number, completedRounds: number): Promise<SessionSummary> {
  const supabase = await createClient();
  const session = await loadSession(supabase, sessionId);
  const topic = (session.state as { topic?: string | null } | null)?.topic ?? null;
  return completeSession(supabase, sessionId, {
    focusSeconds,
    topics: topic ? [topic] : [],
    questionsAnswered: 0,
    correct: 0,
    incorrect: 0,
    weakConcepts: [],
    strongConcepts: [],
    suggestedNext:
      completedRounds === 0
        ? "No full round was completed. Try the 15/5 preset to make the first round easy."
        : "Good focus block. Follow it with a quick Active Recall session on what you just studied so it sticks.",
    nextReviewAt: await nextFlashcardDue(supabase),
    extra: { completedRounds },
  });
}

/** Closes the practice-test blocks of a smart session or routine whose attempt has been submitted. */
export async function syncPlanChildren(parentId: string): Promise<void> {
  const supabase = await createClient();
  const { data: children } = await supabase
    .from("study_sessions")
    .select("*")
    .contains("state", { parentId })
    .eq("status", "in_progress")
    .in("method", [...TEST_METHOD_IDS])
    .limit(20);
  for (const child of children ?? []) {
    await syncPracticeTesting(child).catch((error) => console.error("study_sessions: block sync failed", error));
  }
}

/**
 * Practice-testing sessions finish when their quiz attempt is submitted:
 * the summary is derived from the attempt the first time the session is opened afterwards.
 */
export async function syncPracticeTesting(session: StudySession): Promise<SessionSummary | null> {
  if (session.status !== "in_progress" || !session.quiz_attempt_id) return null;
  const supabase = await createClient();
  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, status, started_at, submitted_at, score, max_score, correct_count, question_count")
    .eq("id", session.quiz_attempt_id)
    .maybeSingle();
  if (!attempt || attempt.status !== "submitted") return null;

  const { data: answers } = await supabase
    .from("quiz_answers")
    .select("is_correct, response, question:quiz_questions!quiz_answers_question_fk(concept:concepts!quiz_questions_concept_fk(name))")
    .eq("attempt_id", attempt.id);
  // A question left blank scores 0 on the test but isn't an answer, and one still waiting for the student's
  // own mark has no result yet: neither counts as answered, nor makes its concept weak.
  const graded = (answers ?? []).filter((answer) => answer.response !== null && answer.is_correct !== null);
  const blank = (answers ?? []).filter((answer) => answer.response === null).length;
  const byConcept = new Map<string, { correct: number; total: number }>();
  for (const answer of graded) {
    const name = (answer.question as unknown as { concept: { name: string } | null } | null)?.concept?.name ?? "General";
    const entry = byConcept.get(name) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (answer.is_correct) entry.correct += 1;
    byConcept.set(name, entry);
  }
  const weak = [...byConcept.entries()].filter(([, value]) => value.correct < value.total).map(([name]) => name);
  const strong = [...byConcept.entries()].filter(([, value]) => value.correct === value.total && value.total > 0).map(([name]) => name);
  const total = attempt.question_count || (answers ?? []).length;
  const correct = attempt.correct_count ?? 0;
  // Blank answers, and questions the attempt never stored an answer for.
  const unanswered = Math.max(0, total - (answers ?? []).length) + blank;
  const focus = attempt.submitted_at ? Math.round((new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 1000) : undefined;
  return completeSession(supabase, session.id, {
    focusSeconds: focus,
    topics: [...byConcept.keys()],
    questionsAnswered: graded.length,
    correct,
    incorrect: Math.max(0, graded.length - correct),
    // The test's result is out of every question, the blank ones included.
    accuracy: total ? correct / total : null,
    weakConcepts: weak,
    strongConcepts: strong,
    suggestedNext: suggestNext(total ? correct / total : null, weak, "practice_testing"),
    nextReviewAt: await nextFlashcardDue(supabase),
    extra: { score: attempt.score, maxScore: attempt.max_score, attemptId: attempt.id, ...(unanswered > 0 ? { unanswered } : {}) },
  });
}
