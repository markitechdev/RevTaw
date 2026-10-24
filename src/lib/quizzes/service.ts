import "server-only";

import { defaultDifficulty, difficultyTargets, refreshMastery, weakConceptNames } from "@/lib/adaptive/engine";
import { awardAttemptXp } from "@/lib/gamification/service";
import { isAiError } from "@/lib/ai";
import { ensureConcepts, normalizeConceptName } from "@/lib/concepts/service";
import { gradeObjective, gradeOpenAnswers, normalizeText, type GradeResult, type OpenAnswerItem } from "@/lib/quizzes/grade";
import { generateQuiz } from "@/lib/quizzes/generate";
import { answerSchema, parseQuizConfig, responseSchema } from "@/lib/quizzes/schemas";
import {
  defaultExamMinutes,
  describeAnswer,
  describeResponse,
  isObjectiveType,
  QUESTION_TYPE_BY_ID,
  type QuestionAnswer,
  type QuestionOption,
  type QuestionResponse,
  type QuizConfig,
} from "@/lib/quizzes/types";
import { friendlyGenerationFailure, loadMaterialContext, ServiceError } from "@/lib/reviewers/service";
import type { ConfidenceLevel, Json, QuestionType, QuizMode } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Seconds after the deadline during which late answers are still accepted (network slack). */
const DEADLINE_GRACE_MS = 20_000;

export { ServiceError };

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function findSourceChunk(excerpt: string, chunks: Array<{ id: string; content: string }>): string | null {
  const needle = normalizeText(excerpt).slice(0, 120);
  if (needle.length < 12) return null;
  for (const chunk of chunks) {
    if (normalizeText(chunk.content).includes(needle)) return chunk.id;
  }
  return null;
}

export async function createQuiz(
  materialId: string,
  config: QuizConfig,
): Promise<{ id: string; status: "ready" | "failed"; detail: string | null }> {
  const supabase = await createClient();
  const context = await loadMaterialContext(supabase, materialId);

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .insert({
      user_id: context.material.user_id,
      material_id: materialId,
      title: `${context.material.title} — Quiz`,
      config: config as unknown as Json,
      status: "generating",
    })
    .select("id")
    .single();
  if (error || !quiz) throw new Error(`quizzes: insert failed: ${error?.message}`);

  const result = await populateQuiz(supabase, quiz.id, context, config);
  return { id: quiz.id, ...result };
}

export async function retryQuiz(quizId: string): Promise<{ status: "ready" | "failed"; detail: string | null }> {
  const supabase = await createClient();
  const { data: quiz } = await supabase.from("quizzes").select("id, material_id, config, status").eq("id", quizId).maybeSingle();
  if (!quiz) throw new ServiceError("Quiz not found.", 404);
  if (quiz.status === "generating") return { status: "failed", detail: "Still generating." };

  const context = await loadMaterialContext(supabase, quiz.material_id);
  await supabase.from("quizzes").update({ status: "generating", status_detail: null }).eq("id", quiz.id);
  await supabase.from("quiz_questions").delete().eq("quiz_id", quiz.id);
  return populateQuiz(supabase, quiz.id, context, parseQuizConfig(quiz.config));
}

async function populateQuiz(
  supabase: Client,
  quizId: string,
  context: Awaited<ReturnType<typeof loadMaterialContext>>,
  config: QuizConfig,
): Promise<{ status: "ready" | "failed"; detail: string | null }> {
  try {
    const adaptive =
      config.difficulty === "adaptive"
        ? { targets: await difficultyTargets(context.material.id), focusConcepts: await weakConceptNames(context.material.id, 4), fallback: await defaultDifficulty() }
        : null;
    const result = await generateQuiz(context.material.title, context.chunks, config, context.student, adaptive);
    if (result.questions.length === 0) {
      throw new ServiceError("No usable questions could be written from this material. Try a different type or a longer material.", 422);
    }

    const concepts = await ensureConcepts(
      supabase,
      context.material.user_id,
      result.questions.map((question) => question.concept),
      { materialId: context.material.id, subjectId: context.material.subject_id },
    );
    const { data: chunkRows } = await supabase.from("material_chunks").select("id, content").eq("material_id", context.material.id);
    const chunks = chunkRows ?? [];

    const rows = result.questions.map((question, position) => ({
      quiz_id: quizId,
      user_id: context.material.user_id,
      position,
      type: question.type,
      difficulty: question.difficulty,
      prompt: question.prompt,
      options: (question.type === "multiple_choice" ? question.options : null) as unknown as Json | null,
      answer: question.answer as unknown as Json,
      explanation: question.explanation,
      concept_id: concepts.get(normalizeConceptName(question.concept)) ?? null,
      source_excerpt: question.source_excerpt || null,
      source_chunk_id: question.source_excerpt ? findSourceChunk(question.source_excerpt, chunks) : null,
      points: QUESTION_TYPE_BY_ID[question.type].points,
    }));
    const { error: questionsError } = await supabase.from("quiz_questions").insert(rows);
    if (questionsError) throw new Error(`quiz_questions: insert failed: ${questionsError.message}`);

    const notes: string[] = [];
    if (result.questions.length < config.questionCount) {
      notes.push(`${result.questions.length} of ${config.questionCount} requested questions could be supported by the material.`);
    }
    if (result.coverageRatio < 1) notes.push(`Built from the first ${Math.round(result.coverageRatio * 100)}% of a very long material.`);
    const detail = notes.length ? notes.join(" ") : null;

    await supabase
      .from("quizzes")
      .update({
        title: result.title,
        status: "ready",
        status_detail: detail,
        provider: result.provider,
        model: result.model,
        question_count: result.questions.length,
      })
      .eq("id", quizId);
    return { status: "ready", detail };
  } catch (generationError) {
    console.error(`quizzes: generation for ${quizId} failed`, generationError);
    const detail = friendlyGenerationFailure(generationError);
    await supabase.from("quizzes").update({ status: "failed", status_detail: detail, question_count: 0 }).eq("id", quizId);
    return { status: "failed", detail };
  }
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

function shuffleInPlace<T>(items: T[], random: () => number = Math.random): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}

function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return () => {
    hash = (hash + 0x6d2b79f5) >>> 0;
    let value = Math.imul(hash ^ (hash >>> 15), 1 | hash);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Option order shown to the student: stable per attempt so results match what they saw. */
export function orderOptions(options: QuestionOption[] | null, shuffle: boolean, attemptId: string, questionId: string): QuestionOption[] | null {
  if (!options) return null;
  if (!shuffle) return options;
  return shuffleInPlace([...options], seededRandom(`${attemptId}:${questionId}`));
}

export function attemptDeadline(attempt: { started_at: string; time_limit_seconds: number | null }): string | null {
  if (!attempt.time_limit_seconds) return null;
  return new Date(new Date(attempt.started_at).getTime() + attempt.time_limit_seconds * 1000).toISOString();
}

function isPastDeadline(attempt: { started_at: string; time_limit_seconds: number | null }, graceMs = DEADLINE_GRACE_MS): boolean {
  const deadline = attemptDeadline(attempt);
  return deadline !== null && Date.now() > new Date(deadline).getTime() + graceMs;
}

export async function startAttempt(quizId: string, options: { mode: QuizMode; timeLimitMinutes: number | null }): Promise<{ id: string }> {
  const supabase = await createClient();
  const [{ data: quiz }, { data: questions }] = await Promise.all([
    supabase.from("quizzes").select("id, user_id, status, config, question_count").eq("id", quizId).maybeSingle(),
    supabase.from("quiz_questions").select("id").eq("quiz_id", quizId).order("position"),
  ]);
  if (!quiz) throw new ServiceError("Quiz not found.", 404);
  if (quiz.status !== "ready" || !questions || questions.length === 0) throw new ServiceError("This quiz is not ready yet.", 409);

  const config = parseQuizConfig(quiz.config);
  const exam = options.mode === "exam";
  const timeLimitMinutes = exam
    ? (options.timeLimitMinutes ?? config.timeLimitMinutes ?? defaultExamMinutes(questions.length))
    : options.timeLimitMinutes;
  const ids = questions.map((question) => question.id);
  const order = exam || config.shuffleQuestions ? shuffleInPlace([...ids]) : ids;

  const { data: attempt, error } = await supabase
    .from("quiz_attempts")
    .insert({
      quiz_id: quizId,
      user_id: quiz.user_id,
      mode: options.mode,
      status: "in_progress",
      time_limit_seconds: timeLimitMinutes ? timeLimitMinutes * 60 : null,
      question_order: order,
      question_count: ids.length,
    })
    .select("id")
    .single();
  if (error || !attempt) throw new Error(`quiz_attempts: insert failed: ${error?.message}`);
  return { id: attempt.id };
}

export type AnswerFeedback = {
  graded: boolean;
  isCorrect: boolean | null;
  score: number | null;
  points: number;
  correctAnswer: string;
  explanation: string | null;
  feedback: string | null;
};

export type SaveAnswerResult = { saved: true; feedback: AnswerFeedback | null };

function validateResponse(type: QuestionType, response: unknown, options: QuestionOption[] | null): QuestionResponse | null {
  if (response === null || response === undefined) return null;
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success) throw new ServiceError("That answer could not be read.", 400);
  const value = parsed.data;
  switch (type) {
    case "multiple_choice":
      if (!("option_id" in value) || !options?.some((option) => option.id === value.option_id)) {
        throw new ServiceError("Pick one of the options.", 400);
      }
      return value;
    case "true_false":
      if (!("value" in value)) throw new ServiceError("Choose true or false.", 400);
      return value;
    default:
      if (!("text" in value)) throw new ServiceError("Type your answer.", 400);
      return value.text.trim() ? { text: value.text.trim() } : null;
  }
}

/**
 * Stores one answer for an in-progress attempt. Objective types are graded at
 * once; open types are graded immediately only when the quiz gives immediate
 * feedback (practice mode), otherwise at submission.
 */
export async function saveAnswer(input: {
  attemptId: string;
  questionId: string;
  response: unknown;
  confidence: ConfidenceLevel | null;
  responseMs: number | null;
}): Promise<SaveAnswerResult> {
  const supabase = await createClient();
  const [{ data: attempt }, { data: question }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("id, quiz_id, user_id, mode, status, started_at, time_limit_seconds, quiz:quizzes!quiz_attempts_quiz_fk(config, material_id, title)")
      .eq("id", input.attemptId)
      .maybeSingle(),
    supabase.from("quiz_questions").select("id, quiz_id, type, prompt, options, answer, explanation, points").eq("id", input.questionId).maybeSingle(),
  ]);
  if (!attempt || !question || question.quiz_id !== attempt.quiz_id) throw new ServiceError("Question not found.", 404);
  if (attempt.status !== "in_progress") throw new ServiceError("This attempt has already been submitted.", 409);
  if (isPastDeadline(attempt)) throw new ServiceError("Time is up for this attempt. Submit it to see your results.", 409);

  const quiz = attempt.quiz as unknown as { config: Json; material_id: string; title: string } | null;
  const config = parseQuizConfig(quiz?.config);
  const options = question.options as unknown as QuestionOption[] | null;
  const answer = answerSchema.parse(question.answer) as QuestionAnswer;
  const response = validateResponse(question.type, input.response, options);
  const immediate = attempt.mode === "practice" && config.feedback === "immediate";

  if (immediate) {
    // Once the correct answer has been shown, the question is locked.
    const { data: existing } = await supabase
      .from("quiz_answers")
      .select("graded_by")
      .eq("attempt_id", attempt.id)
      .eq("question_id", question.id)
      .maybeSingle();
    if (existing?.graded_by) throw new ServiceError("This question was already checked and cannot be changed.", 409);
  }

  let grade: GradeResult | null = gradeObjective(question.type, answer, response, question.points);
  if (!grade && response && "text" in response && immediate && "model_answer" in answer) {
    try {
      const graded = await gradeOpenAnswers(quiz?.title ?? "the material", [
        {
          id: question.id,
          type: question.type,
          prompt: question.prompt,
          points: question.points,
          modelAnswer: answer.model_answer,
          rubric: answer.rubric,
          studentAnswer: response.text,
        },
      ]);
      grade = graded.get(question.id) ?? null;
    } catch (error) {
      if (!isAiError(error)) throw error;
      console.warn("quizzes: immediate grading unavailable", error.message);
    }
  }

  const { error } = await supabase.from("quiz_answers").upsert(
    {
      attempt_id: attempt.id,
      question_id: question.id,
      user_id: attempt.user_id,
      response: response as unknown as Json | null,
      is_correct: grade?.isCorrect ?? null,
      score: grade?.score ?? null,
      feedback: grade?.feedback ?? null,
      graded_by: grade?.gradedBy ?? null,
      confidence: input.confidence,
      response_ms: input.responseMs,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id,question_id" },
  );
  if (error) throw new Error(`quiz_answers: upsert failed: ${error.message}`);

  if (!immediate) return { saved: true, feedback: null };
  return {
    saved: true,
    feedback: {
      graded: grade !== null,
      isCorrect: grade?.isCorrect ?? null,
      score: grade?.score ?? null,
      points: question.points,
      correctAnswer: describeAnswer(answer, options),
      explanation: question.explanation,
      feedback: grade?.feedback ?? null,
    },
  };
}

type StoredAnswerRow = {
  id: string;
  question_id: string;
  response: Json | null;
  is_correct: boolean | null;
  score: number | null;
  feedback: string | null;
  graded_by: "auto" | "ai" | "self" | null;
};

type StoredQuestionRow = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: Json | null;
  answer: Json;
  explanation: string | null;
  concept_id: string | null;
  points: number;
};

async function recordMistake(
  supabase: Client,
  attempt: { id: string; user_id: string; material_id: string | null },
  question: StoredQuestionRow,
  response: QuestionResponse | null,
) {
  const options = question.options as unknown as QuestionOption[] | null;
  const answer = answerSchema.parse(question.answer) as QuestionAnswer;
  const { data: existing } = await supabase
    .from("mistakes")
    .select("id")
    .eq("attempt_id", attempt.id)
    .eq("question_id", question.id)
    .maybeSingle();
  if (existing) return;
  await supabase.from("mistakes").insert({
    user_id: attempt.user_id,
    question_id: question.id,
    attempt_id: attempt.id,
    concept_id: question.concept_id,
    material_id: attempt.material_id,
    question_text: question.prompt.slice(0, 4000),
    student_answer: describeResponse(response, options)?.slice(0, 4000) ?? null,
    correct_answer: describeAnswer(answer, options).slice(0, 4000),
    explanation: question.explanation?.slice(0, 4000) ?? null,
  });
}

/**
 * Submits an attempt: grades what is still ungraded, stores the score and
 * files every incorrect answer in the mistake notebook. Safe to call twice.
 */
export async function submitAttempt(attemptId: string): Promise<{ submitted: boolean; needsSelfCheck: number }> {
  const supabase = await createClient();
  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_id, user_id, status, started_at, time_limit_seconds, quiz:quizzes!quiz_attempts_quiz_fk(material_id, title)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) throw new ServiceError("Attempt not found.", 404);
  if (attempt.status === "submitted") return { submitted: true, needsSelfCheck: 0 };

  const [{ data: questionRows }, { data: answerRows }] = await Promise.all([
    supabase.from("quiz_questions").select("id, type, prompt, options, answer, explanation, concept_id, points").eq("quiz_id", attempt.quiz_id),
    supabase.from("quiz_answers").select("id, question_id, response, is_correct, score, feedback, graded_by").eq("attempt_id", attempt.id),
  ]);
  const questions = (questionRows ?? []) as StoredQuestionRow[];
  const answers = new Map((answerRows ?? []).map((row) => [row.question_id, row as StoredAnswerRow]));
  const quiz = attempt.quiz as unknown as { material_id: string; title: string } | null;

  // Grade open answers that were saved without a grade (exam mode / deferred feedback).
  const openItems: OpenAnswerItem[] = [];
  for (const question of questions) {
    const stored = answers.get(question.id);
    if (!stored || stored.graded_by || !stored.response || isObjectiveType(question.type)) continue;
    const response = responseSchema.parse(stored.response);
    const answer = answerSchema.parse(question.answer);
    if (!("text" in response) || !("model_answer" in answer)) continue;
    openItems.push({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      modelAnswer: answer.model_answer,
      rubric: answer.rubric,
      studentAnswer: response.text,
    });
  }
  let grades = new Map<string, GradeResult>();
  let needsSelfCheck = 0;
  if (openItems.length > 0) {
    try {
      grades = await gradeOpenAnswers(quiz?.title ?? "the material", openItems);
    } catch (error) {
      if (!isAiError(error)) throw error;
      console.warn("quizzes: deferred grading unavailable", error.message);
    }
  }

  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  const now = new Date().toISOString();
  for (const question of questions) {
    maxScore += question.points;
    const stored = answers.get(question.id);
    const response = stored?.response ? responseSchema.parse(stored.response) : null;
    let isCorrect = stored?.is_correct ?? null;
    let answerScore = stored?.score ?? null;
    let gradedBy = stored?.graded_by ?? null;
    let feedback = stored?.feedback ?? null;

    if (!stored || !response) {
      isCorrect = false;
      answerScore = 0;
      gradedBy = "auto";
      feedback = stored?.feedback ?? "No answer was given.";
    } else if (!gradedBy) {
      const grade = grades.get(question.id);
      if (grade) {
        isCorrect = grade.isCorrect;
        answerScore = grade.score;
        gradedBy = grade.gradedBy;
        feedback = grade.feedback;
      } else {
        needsSelfCheck += 1;
      }
    }

    if (!stored || !response || stored.graded_by !== gradedBy || stored.is_correct !== isCorrect) {
      const { error } = await supabase.from("quiz_answers").upsert(
        {
          attempt_id: attempt.id,
          question_id: question.id,
          user_id: attempt.user_id,
          response: response as unknown as Json | null,
          is_correct: isCorrect,
          score: answerScore,
          feedback,
          graded_by: gradedBy,
          answered_at: stored ? undefined : now,
        },
        { onConflict: "attempt_id,question_id" },
      );
      if (error) throw new Error(`quiz_answers: finalize failed: ${error.message}`);
    }

    score += answerScore ?? 0;
    if (isCorrect) correctCount += 1;
    if (isCorrect === false) {
      await recordMistake(supabase, { id: attempt.id, user_id: attempt.user_id, material_id: quiz?.material_id ?? null }, question, response);
    }
  }

  const { error } = await supabase
    .from("quiz_attempts")
    .update({ status: "submitted", submitted_at: now, score, max_score: maxScore, correct_count: correctCount, question_count: questions.length })
    .eq("id", attempt.id)
    .eq("status", "in_progress");
  if (error) throw new Error(`quiz_attempts: submit failed: ${error.message}`);
  await refreshMastery(questions.map((question) => question.concept_id).filter((id): id is string => Boolean(id)));
  await awardAttemptXp(supabase, { id: attempt.id, title: quiz?.title ?? null }, { answered: questions.length, correct: correctCount });
  return { submitted: true, needsSelfCheck };
}

/** Lets the student grade an open answer the AI could not grade (or override a self-grade). */
export async function selfGradeAnswer(answerId: string, verdict: "correct" | "partial" | "incorrect"): Promise<void> {
  const supabase = await createClient();
  const { data: stored } = await supabase
    .from("quiz_answers")
    .select("id, attempt_id, question_id, response, graded_by, question:quiz_questions!quiz_answers_question_fk(id, type, prompt, options, answer, explanation, concept_id, points)")
    .eq("id", answerId)
    .maybeSingle();
  if (!stored) throw new ServiceError("Answer not found.", 404);
  if (stored.graded_by && stored.graded_by !== "self") throw new ServiceError("This answer was already graded.", 409);
  const question = stored.question as unknown as StoredQuestionRow | null;
  if (!question || isObjectiveType(question.type)) throw new ServiceError("Only open answers can be self-checked.", 400);

  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, user_id, status, quiz:quizzes!quiz_attempts_quiz_fk(material_id)")
    .eq("id", stored.attempt_id)
    .maybeSingle();
  if (!attempt || attempt.status !== "submitted") throw new ServiceError("Submit the attempt first.", 409);

  const score = verdict === "correct" ? question.points : verdict === "partial" ? Math.max(1, Math.floor(question.points / 2)) : 0;
  const isCorrect = verdict !== "incorrect";
  const { error } = await supabase
    .from("quiz_answers")
    .update({ score, is_correct: isCorrect, graded_by: "self", feedback: "Checked by you against the model answer." })
    .eq("id", stored.id);
  if (error) throw new Error(`quiz_answers: self-grade failed: ${error.message}`);

  const materialId = (attempt.quiz as unknown as { material_id: string } | null)?.material_id ?? null;
  if (isCorrect) {
    await supabase.from("mistakes").delete().eq("attempt_id", attempt.id).eq("question_id", question.id);
  } else {
    const response = stored.response ? responseSchema.parse(stored.response) : null;
    await recordMistake(supabase, { id: attempt.id, user_id: attempt.user_id, material_id: materialId }, question, response);
  }

  const { data: rows } = await supabase.from("quiz_answers").select("score, is_correct").eq("attempt_id", attempt.id);
  const total = (rows ?? []).reduce((sum, row) => sum + (row.score ?? 0), 0);
  const correct = (rows ?? []).filter((row) => row.is_correct).length;
  await supabase.from("quiz_attempts").update({ score: total, correct_count: correct }).eq("id", attempt.id);
  if (question.concept_id) await refreshMastery([question.concept_id]);
}

/** Auto-submits an attempt whose time ran out while the student was away. */
export async function expireIfNeeded(attempt: { id: string; status: string; started_at: string; time_limit_seconds: number | null }): Promise<boolean> {
  if (attempt.status !== "in_progress" || !isPastDeadline(attempt)) return false;
  await submitAttempt(attempt.id);
  return true;
}
