import "server-only";

import { cache } from "react";

import { attemptDeadline, orderOptions } from "@/lib/quizzes/service";
import {
  answerSchema,
  describeAnswer,
  describeResponse,
  parseQuizConfig,
  responseSchema,
  type QuestionAnswer,
  type QuestionOption,
  type QuestionResponse,
  type QuizConfig,
} from "@/lib/quizzes/types";
import type { ConfidenceLevel, Json, Mistake, Quiz, QuizAttempt, QuizQuestion } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type MaterialRef = { id: string; title: string; subject: { name: string } | null } | null;

export type QuizListItem = Pick<Quiz, "id" | "material_id" | "title" | "status" | "status_detail" | "question_count" | "created_at" | "updated_at"> & {
  config: QuizConfig;
  material: MaterialRef;
  attempts: Array<Pick<QuizAttempt, "id" | "status" | "score" | "max_score" | "submitted_at">>;
  bestPercent: number | null;
  attemptCount: number;
};

const LIST_COLUMNS =
  "id, material_id, title, status, status_detail, question_count, config, created_at, updated_at, " +
  "material:materials!quizzes_material_fk(id, title, subject:subjects!materials_subject_fk(name)), " +
  "attempts:quiz_attempts!quiz_attempts_quiz_fk(id, status, score, max_score, submitted_at)";

function withAttemptStats<T extends { attempts: QuizListItem["attempts"] }>(row: T): T & { bestPercent: number | null; attemptCount: number } {
  const submitted = row.attempts.filter((attempt) => attempt.status === "submitted" && attempt.max_score);
  const bestPercent = submitted.length
    ? Math.max(...submitted.map((attempt) => Math.round(((attempt.score ?? 0) / (attempt.max_score ?? 1)) * 100)))
    : null;
  return { ...row, bestPercent, attemptCount: submitted.length };
}

export async function listQuizzes(filters: { materialId?: string } = {}): Promise<QuizListItem[]> {
  const supabase = await createClient();
  let query = supabase.from("quizzes").select(LIST_COLUMNS).is("archived_at", null).order("updated_at", { ascending: false }).limit(200);
  if (filters.materialId) query = query.eq("material_id", filters.materialId);
  const { data, error } = await query;
  if (error) {
    console.error("quizzes: list failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const typed = row as unknown as Omit<QuizListItem, "config" | "bestPercent" | "attemptCount"> & { config: Json };
    return withAttemptStats({ ...typed, config: parseQuizConfig(typed.config) });
  });
}

export const countQuizzes = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase.from("quizzes").select("id", { count: "exact", head: true }).is("archived_at", null).eq("status", "ready");
  return count ?? 0;
});

export type QuizDetail = Omit<Quiz, "config"> & {
  config: QuizConfig;
  material: MaterialRef;
  attempts: Array<Pick<QuizAttempt, "id" | "mode" | "status" | "score" | "max_score" | "correct_count" | "question_count" | "started_at" | "submitted_at" | "time_limit_seconds">>;
  typeCounts: Array<{ type: QuizQuestion["type"]; count: number }>;
};

export const getQuiz = cache(async (quizId: string): Promise<QuizDetail | null> => {
  const supabase = await createClient();
  const [{ data: quiz, error }, { data: questions }, { data: attempts }] = await Promise.all([
    supabase
      .from("quizzes")
      .select("*, material:materials!quizzes_material_fk(id, title, subject:subjects!materials_subject_fk(name))")
      .eq("id", quizId)
      .maybeSingle(),
    supabase.from("quiz_questions").select("type").eq("quiz_id", quizId),
    supabase
      .from("quiz_attempts")
      .select("id, mode, status, score, max_score, correct_count, question_count, started_at, submitted_at, time_limit_seconds")
      .eq("quiz_id", quizId)
      .order("started_at", { ascending: false })
      .limit(50),
  ]);
  if (error) {
    console.error("quizzes: get failed", error.message);
    return null;
  }
  if (!quiz) return null;
  const counts = new Map<QuizQuestion["type"], number>();
  for (const question of questions ?? []) counts.set(question.type, (counts.get(question.type) ?? 0) + 1);
  const typed = quiz as unknown as Omit<QuizDetail, "config" | "attempts" | "typeCounts"> & { config: Json };
  return {
    ...typed,
    config: parseQuizConfig(typed.config),
    attempts: attempts ?? [],
    typeCounts: [...counts.entries()].map(([type, count]) => ({ type, count })),
  };
});

/** A question as the student sees it mid-attempt: no answer, explanation or source. */
export type RunnerQuestion = {
  id: string;
  type: QuizQuestion["type"];
  difficulty: QuizQuestion["difficulty"];
  prompt: string;
  options: QuestionOption[] | null;
  points: number;
};

export type RunnerAnswer = {
  questionId: string;
  response: QuestionResponse | null;
  confidence: ConfidenceLevel | null;
  responseMs: number | null;
  isCorrect: boolean | null;
  graded: boolean;
};

export type AttemptRunnerView = {
  attempt: Pick<QuizAttempt, "id" | "quiz_id" | "mode" | "status" | "started_at" | "time_limit_seconds" | "question_count">;
  quiz: { id: string; title: string; config: QuizConfig };
  deadline: string | null;
  questions: RunnerQuestion[];
  answers: RunnerAnswer[];
};

export type ResultQuestion = RunnerQuestion & {
  position: number;
  explanation: string | null;
  sourceExcerpt: string | null;
  concept: { id: string; name: string } | null;
  correctAnswer: string;
  answer: QuestionAnswer;
  response: QuestionResponse | null;
  studentAnswer: string | null;
  answerId: string | null;
  isCorrect: boolean | null;
  score: number | null;
  feedback: string | null;
  gradedBy: "auto" | "ai" | "self" | null;
  confidence: ConfidenceLevel | null;
  responseMs: number | null;
};

export type AttemptResultsView = {
  attempt: Pick<QuizAttempt, "id" | "quiz_id" | "mode" | "status" | "started_at" | "submitted_at" | "time_limit_seconds" | "score" | "max_score" | "correct_count" | "question_count">;
  quiz: { id: string; title: string; material_id: string; config: QuizConfig };
  questions: ResultQuestion[];
  conceptSummary: Array<{ id: string | null; name: string; correct: number; total: number }>;
  needsSelfCheck: number;
};

type AttemptRow = Pick<QuizAttempt, "id" | "quiz_id" | "mode" | "status" | "started_at" | "submitted_at" | "time_limit_seconds" | "score" | "max_score" | "correct_count" | "question_count" | "question_order"> & {
  quiz: { id: string; title: string; material_id: string; config: Json } | null;
};

type QuestionRow = Pick<QuizQuestion, "id" | "position" | "type" | "difficulty" | "prompt" | "options" | "answer" | "explanation" | "source_excerpt" | "points"> & {
  concept: { id: string; name: string } | null;
};

type AnswerRow = {
  id: string;
  question_id: string;
  response: Json | null;
  is_correct: boolean | null;
  score: number | null;
  feedback: string | null;
  graded_by: "auto" | "ai" | "self" | null;
  confidence: ConfidenceLevel | null;
  response_ms: number | null;
};

async function loadAttempt(attemptId: string): Promise<{ attempt: AttemptRow; questions: QuestionRow[]; answers: AnswerRow[] } | null> {
  const supabase = await createClient();
  const { data: attempt, error } = await supabase
    .from("quiz_attempts")
    .select(
      "id, quiz_id, mode, status, started_at, submitted_at, time_limit_seconds, score, max_score, correct_count, question_count, question_order, quiz:quizzes!quiz_attempts_quiz_fk(id, title, material_id, config)",
    )
    .eq("id", attemptId)
    .maybeSingle();
  if (error) {
    console.error("quiz_attempts: get failed", error.message);
    return null;
  }
  if (!attempt) return null;
  const [{ data: questions }, { data: answers }] = await Promise.all([
    supabase
      .from("quiz_questions")
      .select("id, position, type, difficulty, prompt, options, answer, explanation, source_excerpt, points, concept:concepts!quiz_questions_concept_fk(id, name)")
      .eq("quiz_id", attempt.quiz_id)
      .order("position"),
    supabase
      .from("quiz_answers")
      .select("id, question_id, response, is_correct, score, feedback, graded_by, confidence, response_ms")
      .eq("attempt_id", attemptId),
  ]);
  const order = Array.isArray(attempt.question_order) ? (attempt.question_order as string[]) : [];
  const byId = new Map((questions ?? []).map((question) => [question.id, question as unknown as QuestionRow]));
  const ordered = order.map((id) => byId.get(id)).filter((question): question is QuestionRow => Boolean(question));
  for (const question of byId.values()) if (!order.includes(question.id)) ordered.push(question);
  return { attempt: attempt as unknown as AttemptRow, questions: ordered, answers: (answers ?? []) as AnswerRow[] };
}

export const getAttemptRunner = cache(async (attemptId: string): Promise<AttemptRunnerView | null> => {
  const loaded = await loadAttempt(attemptId);
  const quiz = loaded?.attempt.quiz;
  if (!loaded || !quiz) return null;
  const { attempt, questions, answers } = loaded;
  const config = parseQuizConfig(quiz.config);
  const shuffle = attempt.mode === "exam" || config.shuffleOptions;
  const answerByQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));
  return {
    attempt: {
      id: attempt.id,
      quiz_id: attempt.quiz_id,
      mode: attempt.mode,
      status: attempt.status,
      started_at: attempt.started_at,
      time_limit_seconds: attempt.time_limit_seconds,
      question_count: attempt.question_count,
    },
    quiz: { id: quiz.id, title: quiz.title, config },
    deadline: attemptDeadline(attempt),
    questions: questions.map((question) => ({
      id: question.id,
      type: question.type,
      difficulty: question.difficulty,
      prompt: question.prompt,
      options: orderOptions(question.options as unknown as QuestionOption[] | null, shuffle, attempt.id, question.id),
      points: question.points,
    })),
    answers: questions.flatMap((question) => {
      const stored = answerByQuestion.get(question.id);
      if (!stored) return [];
      const parsed = stored.response ? responseSchema.safeParse(stored.response) : null;
      return [
        {
          questionId: question.id,
          response: parsed?.success ? parsed.data : null,
          confidence: stored.confidence,
          responseMs: stored.response_ms,
          isCorrect: stored.graded_by ? stored.is_correct : null,
          graded: Boolean(stored.graded_by),
        },
      ];
    }),
  };
});

export const getAttemptResults = cache(async (attemptId: string): Promise<AttemptResultsView | null> => {
  const loaded = await loadAttempt(attemptId);
  const quiz = loaded?.attempt.quiz;
  if (!loaded || !quiz) return null;
  const { attempt, questions, answers } = loaded;
  const config = parseQuizConfig(quiz.config);
  const shuffle = attempt.mode === "exam" || config.shuffleOptions;
  const answerByQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));
  const concepts = new Map<string, { id: string | null; name: string; correct: number; total: number }>();
  let needsSelfCheck = 0;

  const results: ResultQuestion[] = questions.map((question, index) => {
    const stored = answerByQuestion.get(question.id) ?? null;
    const options = orderOptions(question.options as unknown as QuestionOption[] | null, shuffle, attempt.id, question.id);
    const answer = answerSchema.parse(question.answer) as QuestionAnswer;
    const parsed = stored?.response ? responseSchema.safeParse(stored.response) : null;
    const response = parsed?.success ? parsed.data : null;
    if (stored && response && !stored.graded_by) needsSelfCheck += 1;

    const key = question.concept?.id ?? "__none";
    const entry = concepts.get(key) ?? { id: question.concept?.id ?? null, name: question.concept?.name ?? "General", correct: 0, total: 0 };
    entry.total += 1;
    if (stored?.is_correct) entry.correct += 1;
    concepts.set(key, entry);

    return {
      id: question.id,
      position: index,
      type: question.type,
      difficulty: question.difficulty,
      prompt: question.prompt,
      options,
      points: question.points,
      explanation: question.explanation,
      sourceExcerpt: question.source_excerpt,
      concept: question.concept,
      answer,
      correctAnswer: describeAnswer(answer, options),
      response,
      studentAnswer: describeResponse(response, options),
      answerId: stored?.id ?? null,
      isCorrect: stored?.is_correct ?? null,
      score: stored?.score ?? null,
      feedback: stored?.feedback ?? null,
      gradedBy: stored?.graded_by ?? null,
      confidence: stored?.confidence ?? null,
      responseMs: stored?.response_ms ?? null,
    };
  });

  return {
    attempt: {
      id: attempt.id,
      quiz_id: attempt.quiz_id,
      mode: attempt.mode,
      status: attempt.status,
      started_at: attempt.started_at,
      submitted_at: attempt.submitted_at,
      time_limit_seconds: attempt.time_limit_seconds,
      score: attempt.score,
      max_score: attempt.max_score,
      correct_count: attempt.correct_count,
      question_count: attempt.question_count,
    },
    quiz: { id: quiz.id, title: quiz.title, material_id: quiz.material_id, config },
    questions: results,
    conceptSummary: [...concepts.values()].sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total),
    needsSelfCheck,
  };
});

export type MistakeListItem = Mistake & {
  concept: { id: string; name: string } | null;
  material: { id: string; title: string } | null;
};

export async function listMistakes(filters: { resolved?: boolean; conceptId?: string } = {}): Promise<MistakeListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("mistakes")
    .select("*, concept:concepts!mistakes_concept_fk(id, name), material:materials!mistakes_material_fk(id, title)")
    .order("created_at", { ascending: false })
    .limit(300);
  query = filters.resolved ? query.not("resolved_at", "is", null) : query.is("resolved_at", null);
  if (filters.conceptId) query = query.eq("concept_id", filters.conceptId);
  const { data, error } = await query;
  if (error) {
    console.error("mistakes: list failed", error.message);
    return [];
  }
  return (data ?? []) as unknown as MistakeListItem[];
}

export const countOpenMistakes = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase.from("mistakes").select("id", { count: "exact", head: true }).is("resolved_at", null);
  return count ?? 0;
});

export type ConceptPerformance = {
  id: string;
  name: string;
  correct: number;
  total: number;
  accuracy: number;
  lastAnsweredAt: string;
};

/**
 * Accuracy per concept from the student's recent graded answers. This is the
 * seed of the adaptive engine (Phase 6 adds mastery and retrieval strength).
 */
export const getConceptPerformance = cache(async (): Promise<ConceptPerformance[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quiz_answers")
    .select("is_correct, answered_at, question:quiz_questions!quiz_answers_question_fk(concept:concepts!quiz_questions_concept_fk(id, name))")
    .not("is_correct", "is", null)
    .order("answered_at", { ascending: false })
    .limit(600);
  if (error) {
    console.error("quiz_answers: concept performance failed", error.message);
    return [];
  }
  const byConcept = new Map<string, ConceptPerformance>();
  for (const row of data ?? []) {
    const concept = (row.question as unknown as { concept: { id: string; name: string } | null } | null)?.concept;
    if (!concept) continue;
    const entry = byConcept.get(concept.id) ?? { id: concept.id, name: concept.name, correct: 0, total: 0, accuracy: 0, lastAnsweredAt: row.answered_at };
    entry.total += 1;
    if (row.is_correct) entry.correct += 1;
    byConcept.set(concept.id, entry);
  }
  return [...byConcept.values()].map((entry) => ({ ...entry, accuracy: entry.total ? entry.correct / entry.total : 0 }));
});

export type RecentAttempt = Pick<QuizAttempt, "id" | "quiz_id" | "mode" | "score" | "max_score" | "correct_count" | "question_count" | "submitted_at"> & {
  quiz: { title: string } | null;
};

export const listRecentAttempts = cache(async (limit = 5): Promise<RecentAttempt[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_id, mode, score, max_score, correct_count, question_count, submitted_at, quiz:quizzes!quiz_attempts_quiz_fk(title)")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("quiz_attempts: recent failed", error.message);
    return [];
  }
  return (data ?? []) as unknown as RecentAttempt[];
});
