import "server-only";

import { refreshMastery, weakConceptNames as masteryWeakConcepts } from "@/lib/adaptive/engine";
import { markSmartBlock, startSmartSession } from "@/lib/adaptive/smart";
import { ensureConcepts, normalizeConceptName } from "@/lib/concepts/service";
import { isAiError } from "@/lib/ai";
import { getConceptPerformance } from "@/lib/quizzes/queries";
import { createQuiz, startAttempt } from "@/lib/quizzes/service";
import { QUESTION_TYPE_IDS } from "@/lib/quizzes/types";
import { loadMaterialContext, ServiceError } from "@/lib/reviewers/service";
import { startBlurting, startChunking, startCumulativeReview, startInterleaving, startQuestionGeneration, startRapidReview, startRetrievalPractice } from "@/lib/study/advanced";
import { startFadedExamples, startPracticeProblems, startWorkedExamples } from "@/lib/study/flows/problems";
import { analyzeFeynmanExplanation, compareRecallAnswer, generateRecallQuestions, pickFeynmanConcepts, type FeynmanAnalysis, type RecallComparison } from "@/lib/study/ai";
import { isTutorMethod, METHOD_BEHAVIOUR, TEST_METHOD_IDS, type BuilderMethodId, type TestMethodId } from "@/lib/study/catalog";
import { loadOpenItem } from "@/lib/study/items";
import type { StudyMethodId } from "@/lib/study/methods";
import type { ProblemDifficulty } from "@/lib/study/prompts/problems";
import { completeSession, createSession, loadSession, SessionError, sessionTitle, suggestNext, updateSessionState, type SessionSummary } from "@/lib/study/sessions";
import type { ConfidenceLevel, Json, SessionGoal, StudySession, StudySessionItem } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { startTutorSession } from "@/lib/tutor/service";

type Client = Awaited<ReturnType<typeof createClient>>;

export { SessionError, ServiceError };

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
  /** Practice problems only. */
  problemDifficulty?: ProblemDifficulty | "adaptive";
  /** Pomodoro only. */
  workMinutes?: number;
  breakMinutes?: number;
  topic?: string | null;
  /** Set when the session is one block of a smart session. */
  parentSessionId?: string | null;
  parentBlockKey?: string | null;
  /** Set when the session was started from a planner task; completing it closes the task. */
  taskId?: string | null;
};

export type StartSessionResult = { sessionId: string; redirect: string };

/** Recall prompts per planned minute: about two minutes each, 3-15 items. */
function recallCount(minutes: number): number {
  return Math.max(3, Math.min(15, Math.round(minutes / 2)));
}

function feynmanCount(minutes: number): number {
  return Math.max(1, Math.min(4, Math.round(minutes / 8)));
}

async function weakConceptNames(materialId: string | null = null, limit = 6): Promise<string[]> {
  const fromMastery = await masteryWeakConcepts(materialId, limit);
  if (fromMastery.length) return fromMastery;
  const performance = await getConceptPerformance();
  return performance
    .filter((concept) => concept.accuracy < 0.7)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit)
    .map((concept) => concept.name);
}

/**
 * Starts a session of the chosen method: generates its items (active recall,
 * Feynman), gathers open mistakes (error review), creates a quiz and attempt
 * (practice testing) or just records the timer settings (Pomodoro).
 */
export async function startSession(userId: string, input: StartSessionInput): Promise<StartSessionResult> {
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
  const behaviour = METHOD_BEHAVIOUR[input.method];
  if (behaviour.requiresMaterial && !input.materialId) throw new SessionError("Choose a material for this method.", 400);

  if (input.method === "smart_study") {
    let materialTitle: string | null = null;
    if (input.materialId) {
      const { data: material } = await supabase.from("materials").select("title, status").eq("id", input.materialId).maybeSingle();
      if (!material) throw new SessionError("Material not found.", 404);
      if (material.status !== "ready") throw new SessionError("This material has not finished processing yet.", 409);
      materialTitle = material.title;
    }
    const { count } = await supabase.from("mistakes").select("id", { count: "exact", head: true }).is("resolved_at", null);
    const { sessionId } = await startSmartSession(userId, { materialId: input.materialId, goal: input.goal, minutes: input.plannedMinutes, materialTitle, openMistakes: count ?? 0 });
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
  }
}

async function startRecallSession(supabase: Client, userId: string, input: StartSessionInput): Promise<StartSessionResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const [weak, { data: mistakes }] = await Promise.all([
    weakConceptNames(context.material.id),
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
  const weak = await weakConceptNames(context.material.id);
  const generated = await pickFeynmanConcepts({
    materialTitle: context.material.title,
    chunks: context.chunks,
    count: feynmanCount(input.plannedMinutes),
    focusConcepts: weak,
    student: context.student,
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
  let query = supabase
    .from("mistakes")
    .select("id, question_text, correct_answer, explanation, concept_id, material_id, material:materials!mistakes_material_fk(title)")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(recallCount(input.plannedMinutes));
  if (input.materialId) query = query.eq("material_id", input.materialId);
  const { data: mistakes } = await query;
  if (!mistakes || mistakes.length === 0) throw new SessionError("Your mistake notebook has nothing open to retest.", 422);

  const materialTitle = input.materialId ? ((mistakes[0].material as unknown as { title: string } | null)?.title ?? null) : null;
  const { id } = await createSession(supabase, userId, {
    method: "error_review",
    materialId: input.materialId,
    goal: input.goal,
    plannedMinutes: input.plannedMinutes,
    title: materialTitle ? `${materialTitle} — Error Review` : "Error Review — mistake notebook",
    state: { index: 0 },
  });
  const { error } = await supabase.from("study_session_items").insert(
    mistakes.map((mistake, position) => ({
      session_id: id,
      user_id: userId,
      position,
      kind: "mistake" as const,
      concept_id: mistake.concept_id,
      prompt: mistake.question_text,
      model_answer: mistake.correct_answer,
      key_points: [] as unknown as Json,
      source_excerpt: mistake.explanation?.slice(0, 1000) ?? null,
      source_mistake_id: mistake.id,
    })),
  );
  if (error) throw new Error(`study_session_items: insert failed: ${error.message}`);
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
    focus: null,
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

export type RecallItemResult = {
  comparison: RecallComparison;
  isCorrect: boolean;
  modelAnswer: string;
  sourceExcerpt: string | null;
};

/** Item kinds answered through the recall comparison (the other kinds have their own flows). */
const RECALL_FLOW_KINDS: ReadonlyArray<StudySessionItem["kind"]> = ["recall", "mistake", "chunk"];

/** Compares a recall answer with the model answer and stores the result; wrong answers go to the notebook. */
export async function answerRecallItem(input: { itemId: string; response: string; confidence: ConfidenceLevel | null; responseMs: number | null }): Promise<RecallItemResult> {
  const supabase = await createClient();
  const { item, session } = await loadOpenItem(supabase, input.itemId);
  if (!RECALL_FLOW_KINDS.includes(item.kind)) throw new SessionError("This item uses a different flow.", 400);
  if (item.answered_at && item.analysis && (item.analysis as { verdict?: string }).verdict) {
    const comparison = item.analysis as unknown as RecallComparison;
    return { comparison, isCorrect: Boolean(item.is_correct), modelAnswer: item.model_answer ?? "", sourceExcerpt: item.source_excerpt };
  }

  const keyPoints = Array.isArray(item.key_points) ? (item.key_points as string[]) : [];
  let comparison: RecallComparison;
  try {
    const result = await compareRecallAnswer({
      materialTitle: session.title,
      prompt: item.prompt,
      modelAnswer: item.model_answer ?? "",
      keyPoints,
      studentAnswer: input.response,
    });
    comparison = result.comparison;
  } catch (error) {
    if (!isAiError(error)) throw error;
    // Without AI the student still sees the model answer; nothing is scored.
    comparison = {
      verdict: "partial",
      score: 50,
      correct_points: [],
      missing_points: [],
      incorrect_points: [],
      feedback: "The AI checker is unavailable, so compare your answer with the model answer yourself.",
    };
  }
  const isCorrect = comparison.score >= 60;
  const now = new Date().toISOString();
  // Chunk items keep their reading text next to the comparison.
  const chunkText = (item.analysis as { chunk?: unknown } | null)?.chunk;
  const { error } = await supabase
    .from("study_session_items")
    .update({
      response: input.response.slice(0, 8000),
      analysis: (chunkText ? { ...comparison, chunk: chunkText } : comparison) as unknown as Json,
      is_correct: isCorrect,
      score: comparison.score,
      confidence: input.confidence,
      response_ms: input.responseMs,
      attempts: item.attempts + 1,
      answered_at: now,
    })
    .eq("id", item.id);
  if (error) throw new Error(`study_session_items: update failed: ${error.message}`);

  await supabase
    .from("study_sessions")
    .update({
      items_total: session.items_total + 1,
      items_correct: session.items_correct + (isCorrect ? 1 : 0),
      items_incorrect: session.items_incorrect + (isCorrect ? 0 : 1),
      state: { ...((session.state as Record<string, unknown>) ?? {}), index: item.position + 1 } as Json,
      last_active_at: now,
    })
    .eq("id", session.id);

  if (item.kind === "mistake" && item.source_mistake_id) {
    // A retested mistake is learned when answered correctly; otherwise it stays open.
    if (isCorrect) await supabase.from("mistakes").update({ resolved_at: now }).eq("id", item.source_mistake_id);
  } else if (!isCorrect) {
    await supabase.from("mistakes").insert({
      user_id: session.user_id,
      concept_id: item.concept_id,
      material_id: item.material_id ?? session.material_id,
      question_text: item.prompt.slice(0, 4000),
      student_answer: input.response.slice(0, 4000) || null,
      correct_answer: (item.model_answer ?? "").slice(0, 4000),
      explanation: comparison.feedback.slice(0, 4000),
    });
  }

  if (item.concept_id) await refreshMastery([item.concept_id]);
  return { comparison, isCorrect, modelAnswer: item.model_answer ?? "", sourceExcerpt: item.source_excerpt };
}

// ---------------------------------------------------------------------------
// Feynman items
// ---------------------------------------------------------------------------

export type FeynmanRoundResult = {
  analysis: FeynmanAnalysis;
  round: number;
  final: boolean;
  idealExplanation: string | null;
  sourceExcerpt: string | null;
};

export const FEYNMAN_MAX_ROUNDS = 2;

/** Analyses one explanation attempt; the ideal explanation is revealed only after the last round. */
export async function analyzeFeynmanItem(input: { itemId: string; explanation: string; responseMs: number | null }): Promise<FeynmanRoundResult> {
  const supabase = await createClient();
  const { item, session } = await loadOpenItem(supabase, input.itemId);
  if (item.kind !== "feynman") throw new SessionError("This item is not a Feynman concept.", 400);
  if (item.attempts >= FEYNMAN_MAX_ROUNDS) throw new SessionError("This concept has already had two attempts.", 409);

  const round = item.attempts + 1;
  const keyPoints = Array.isArray(item.key_points) ? (item.key_points as string[]) : [];
  let analysis: FeynmanAnalysis;
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
    analysis = {
      score: 50,
      correct_concepts: [],
      missing_concepts: [],
      incorrect_ideas: [],
      unnecessary_complexity: [],
      feedback: "The AI coach is unavailable; compare your explanation with the ideal one yourself.",
      improve_prompt: "Re-read the source and add anything you skipped.",
    };
  }
  const final = round >= FEYNMAN_MAX_ROUNDS || analysis.score >= 85;
  const isCorrect = analysis.score >= 70;
  const now = new Date().toISOString();
  const previous = (item.analysis as unknown as { rounds?: unknown[] } | null)?.rounds ?? [];
  const { error } = await supabase
    .from("study_session_items")
    .update({
      response: input.explanation.slice(0, 8000),
      analysis: { rounds: [...previous, { round, ...analysis }], final } as unknown as Json,
      is_correct: isCorrect,
      score: analysis.score,
      response_ms: (item.response_ms ?? 0) + (input.responseMs ?? 0),
      attempts: round,
      answered_at: final ? now : null,
    })
    .eq("id", item.id);
  if (error) throw new Error(`study_session_items: update failed: ${error.message}`);

  if (final) {
    await supabase
      .from("study_sessions")
      .update({
        items_total: session.items_total + 1,
        items_correct: session.items_correct + (isCorrect ? 1 : 0),
        items_incorrect: session.items_incorrect + (isCorrect ? 0 : 1),
        state: { ...((session.state as Record<string, unknown>) ?? {}), index: item.position + 1 } as Json,
        last_active_at: now,
      })
      .eq("id", session.id);
    if (!isCorrect) {
      await supabase.from("mistakes").insert({
        user_id: session.user_id,
        concept_id: item.concept_id,
        material_id: session.material_id,
        question_text: `Explain ${item.prompt} to a beginner.`,
        student_answer: input.explanation.slice(0, 4000) || null,
        correct_answer: (item.model_answer ?? "").slice(0, 4000),
        explanation: analysis.feedback.slice(0, 4000),
        error_type: "misunderstood_concept",
      });
    }
  } else {
    await supabase.from("study_sessions").update({ last_active_at: now }).eq("id", session.id);
  }
  if (final && item.concept_id) await refreshMastery([item.concept_id]);

  return { analysis, round, final, idealExplanation: final ? item.model_answer : null, sourceExcerpt: final ? item.source_excerpt : null };
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
      return accuracy !== null && accuracy >= 0.8 ? "Most of those mistakes are learned now. Take a practice test to confirm it under exam conditions." : suggestNext(accuracy, weak, "active_recall");
    case "blurting":
      return accuracy !== null && accuracy >= 0.8 ? "Strong recall after reading. Blurt again in three days to check it held." : weak[0] ? `Re-read the section on ${weak[0]}, then blurt it again tomorrow before looking.` : "Re-read the sections you forgot, then blurt them again tomorrow.";
    case "question_generation":
      return accuracy !== null && accuracy >= 0.8 ? "Your questions are exam-quality. Answer them yourself in a recall session tomorrow." : "Rewrite the lower-rated questions using the improved versions, then try answering them from memory.";
    case "worked_examples":
      return accuracy !== null && accuracy >= 0.8 ? "You can follow the method on your own. Try faded worked examples next so you rely less on the steps." : "Study the worked steps again, then retry the similar problems you missed.";
    case "faded_worked_examples":
      return accuracy !== null && accuracy >= 0.8 ? "You finished the independent problem — move on to practice problems at a harder level." : "Repeat the faded examples; keep the steps you missed in view until the independent one works.";
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

/** Closes an item-based session (the recall-style methods, Feynman, error review and the other item flows) with its summary. */
export async function completeItemSession(sessionId: string, focusSeconds: number | null, abandoned = false): Promise<SessionSummary> {
  const supabase = await createClient();
  const session = await loadSession(supabase, sessionId);
  const { data: items } = await supabase
    .from("study_session_items")
    .select("prompt, is_correct, score, answered_at, concept:concepts!study_session_items_concept_fk(name)")
    .eq("session_id", sessionId)
    .order("position");
  const answered = (items ?? []).filter((item) => item.answered_at);
  // Question generation keeps the average quality of the student's questions for the summary page.
  const scores = answered.map((item) => item.score).filter((score): score is number => typeof score === "number");
  const extra = session.method === "question_generation" && scores.length ? { averageQuality: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) } : undefined;
  const byConcept = new Map<string, { correct: number; total: number }>();
  for (const item of answered) {
    const name = (item.concept as unknown as { name: string } | null)?.name ?? item.prompt.slice(0, 40);
    const entry = byConcept.get(name) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (item.is_correct) entry.correct += 1;
    byConcept.set(name, entry);
  }
  const correct = answered.filter((item) => item.is_correct).length;
  const weak = [...byConcept.entries()].filter(([, value]) => value.correct < value.total).map(([name]) => name);
  const strong = [...byConcept.entries()].filter(([, value]) => value.correct === value.total && value.total > 0).map(([name]) => name);
  const accuracy = answered.length ? correct / answered.length : null;
  const method = session.method as StudyMethodId;
  return completeSession(supabase, sessionId, {
    focusSeconds: focusSeconds ?? undefined,
    topics: [...byConcept.keys()],
    questionsAnswered: answered.length,
    correct,
    incorrect: answered.length - correct,
    weakConcepts: weak,
    strongConcepts: strong,
    suggestedNext: answered.length === 0 ? "Nothing was answered this time. Try a shorter session so it is easy to finish." : itemSessionNext(method, accuracy, weak),
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
    .select("is_correct, question:quiz_questions!quiz_answers_question_fk(concept:concepts!quiz_questions_concept_fk(name))")
    .eq("attempt_id", attempt.id);
  const byConcept = new Map<string, { correct: number; total: number }>();
  for (const answer of answers ?? []) {
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
  const focus = attempt.submitted_at ? Math.round((new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 1000) : undefined;
  return completeSession(supabase, session.id, {
    focusSeconds: focus,
    topics: [...byConcept.keys()],
    questionsAnswered: total,
    correct,
    incorrect: Math.max(0, total - correct),
    weakConcepts: weak,
    strongConcepts: strong,
    suggestedNext: suggestNext(total ? correct / total : null, weak, "practice_testing"),
    nextReviewAt: await nextFlashcardDue(supabase),
    extra: { score: attempt.score, maxScore: attempt.max_score, attemptId: attempt.id },
  });
}
