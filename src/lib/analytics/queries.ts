import "server-only";

import { cache } from "react";

import { listMastery, type MasteryView } from "@/lib/adaptive/engine";
import { getAnswerCounts } from "@/lib/analytics/answers";
import { addDays, dateIn } from "@/lib/planner/dates";
import { plannerClock } from "@/lib/planner/service";
import type { ConfidenceLevel, MasteryStatus, QuestionDifficulty } from "@/lib/supabase/database.types";
import { readPagesQuietly } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";
import { sessionFocusSeconds } from "@/lib/study/focus";

/**
 * Progress analytics (spec §23): a few understandable figures and charts
 * computed from the evidence tables — never a separate counter that can
 * drift. Calendar days follow the student's time zone.
 */

export const ANALYTICS_DAYS = 30;

export type DailyPoint = { date: string; focusMinutes: number; answered: number; correct: number; cards: number };

export type Breakdown = { key: string; label: string; answered: number; correct: number; accuracy: number | null };

export type MasteryGroup = { id: string | null; name: string; concepts: number; averageMastery: number | null; mastered: number; weak: number; href: string | null };

export type AnalyticsOverview = {
  today: string;
  days: DailyPoint[];
  totals: {
    sessions: number;
    focusMinutes: number;
    questions: number;
    accuracy: number | null;
    averageScore: number | null;
    cards: number;
  };
  scores: Array<{ date: string; percent: number; title: string }>;
  byDifficulty: Breakdown[];
  byConfidence: Breakdown[];
  bySubject: MasteryGroup[];
  byMaterial: MasteryGroup[];
  masteryDistribution: Record<MasteryStatus, number>;
  retrieval: { average: number | null; fading: number };
};

export const DIFFICULTY_ORDER: QuestionDifficulty[] = ["easy", "medium", "hard"];
export const CONFIDENCE_ORDER: ConfidenceLevel[] = ["guessing", "unsure", "somewhat_confident", "very_confident"];
export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { guessing: "Guessing", unsure: "Unsure", somewhat_confident: "Fairly sure", very_confident: "Certain" };
export const DIFFICULTY_LABEL: Record<QuestionDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

function accuracyOf(answered: number, correct: number): number | null {
  return answered > 0 ? Math.round((correct / answered) * 100) : null;
}

function groupMastery(rows: MasteryView[], keyOf: (row: MasteryView) => { id: string | null; name: string; href: string | null } | null): MasteryGroup[] {
  const groups = new Map<string, MasteryGroup & { sum: number }>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const id = key.id ?? "none";
    const group = groups.get(id) ?? { id: key.id, name: key.name, concepts: 0, averageMastery: null, mastered: 0, weak: 0, href: key.href, sum: 0 };
    group.concepts += 1;
    group.sum += Number(row.mastery);
    if (row.status === "mastered") group.mastered += 1;
    if (row.status === "weak") group.weak += 1;
    groups.set(id, group);
  }
  return [...groups.values()]
    .map(({ sum, ...group }) => ({ ...group, averageMastery: group.concepts ? Math.round(sum / group.concepts) : null }))
    .sort((a, b) => (a.averageMastery ?? 0) - (b.averageMastery ?? 0));
}

export const getAnalyticsOverview = cache(async (): Promise<AnalyticsOverview> => {
  const supabase = await createClient();
  const { timezone, today } = await plannerClock();
  const start = addDays(today, -(ANALYTICS_DAYS - 1));
  const since = `${addDays(start, -1)}T00:00:00Z`;
  // Newest first, so a cap drops the oldest rows rather than whichever came back.
  const [sessions, answers, items, reviews, { data: attempts }, mastery, counts] = await Promise.all([
    readPagesQuietly("analytics: sessions", (from, to) => supabase.from("study_sessions").select("method, started_at, completed_at, focus_seconds, status").gte("started_at", since).order("started_at", { ascending: false }).order("id").range(from, to), 2000),
    readPagesQuietly("analytics: answers", (from, to) => supabase.from("quiz_answers").select("answered_at, is_correct, confidence, question:quiz_questions!quiz_answers_question_fk(difficulty)").not("answered_at", "is", null).order("answered_at", { ascending: false }).order("id").range(from, to), 3000),
    readPagesQuietly("analytics: session items", (from, to) => supabase.from("study_session_items").select("answered_at, is_correct, confidence, format").not("answered_at", "is", null).order("answered_at", { ascending: false }).order("id").range(from, to), 3000),
    readPagesQuietly("analytics: reviews", (from, to) => supabase.from("flashcard_reviews").select("reviewed_at").gte("reviewed_at", since).order("reviewed_at", { ascending: false }).order("id").range(from, to), 5000),
    supabase.from("quiz_attempts").select("submitted_at, score, max_score, quiz:quizzes!quiz_attempts_quiz_fk(title)").eq("status", "submitted").gt("max_score", 0).order("submitted_at", { ascending: false }).limit(200),
    listMastery(),
    getAnswerCounts(),
  ]);

  const day = (value: string) => dateIn(value, timezone);
  const days = new Map<string, DailyPoint>();
  for (let index = 0; index < ANALYTICS_DAYS; index += 1) {
    const date = addDays(start, index);
    days.set(date, { date, focusMinutes: 0, answered: 0, correct: 0, cards: 0 });
  }
  const bump = (date: string, patch: Partial<DailyPoint>) => {
    const point = days.get(date);
    if (!point) return;
    point.focusMinutes += patch.focusMinutes ?? 0;
    point.answered += patch.answered ?? 0;
    point.correct += patch.correct ?? 0;
    point.cards += patch.cards ?? 0;
  };

  // The reads start a day early (time zones ahead of UTC); only the window's own days count.
  let sessionsInWindow = 0;
  for (const session of sessions) {
    const date = day(session.completed_at ?? session.started_at);
    if (session.status === "completed" && days.has(date)) sessionsInWindow += 1;
    bump(date, { focusMinutes: sessionFocusSeconds(session) / 60 });
  }
  const difficulty = new Map<QuestionDifficulty, { answered: number; correct: number }>(DIFFICULTY_ORDER.map((level) => [level, { answered: 0, correct: 0 }]));
  const confidence = new Map<ConfidenceLevel, { answered: number; correct: number }>(CONFIDENCE_ORDER.map((level) => [level, { answered: 0, correct: 0 }]));
  const tally = (answeredAt: string | null, isCorrect: boolean | null, level: ConfidenceLevel | null, questionDifficulty: QuestionDifficulty | null) => {
    if (!answeredAt) return;
    bump(day(answeredAt), { answered: 1, correct: isCorrect ? 1 : 0 });
    // Accuracy counts only answers with a result (not one still waiting for a check).
    if (isCorrect === null) return;
    if (questionDifficulty) {
      const entry = difficulty.get(questionDifficulty)!;
      entry.answered += 1;
      if (isCorrect) entry.correct += 1;
    }
    if (level) {
      const entry = confidence.get(level)!;
      entry.answered += 1;
      if (isCorrect) entry.correct += 1;
    }
  };
  for (const answer of answers) tally(answer.answered_at, answer.is_correct, answer.confidence, (answer.question as unknown as { difficulty: QuestionDifficulty } | null)?.difficulty ?? null);
  for (const item of items) tally(item.answered_at, item.is_correct, item.confidence, item.format === "easy" || item.format === "medium" || item.format === "hard" ? item.format : null);
  for (const review of reviews) bump(day(review.reviewed_at), { cards: 1 });

  const scores = (attempts ?? [])
    .filter((attempt) => attempt.submitted_at && attempt.max_score)
    .map((attempt) => ({ date: day(attempt.submitted_at!), percent: Math.round(((attempt.score ?? 0) / attempt.max_score!) * 100), title: (attempt.quiz as unknown as { title: string } | null)?.title ?? "Quiz" }));
  const averageScore = scores.length ? Math.round(scores.reduce((sum, entry) => sum + entry.percent, 0) / scores.length) : null;

  const practiced = mastery.filter((row) => row.attempts > 0);
  const materialIds = [...new Set(practiced.map((row) => row.concept?.material_id).filter((id): id is string => Boolean(id)))];
  const { data: materials } = materialIds.length ? await supabase.from("materials").select("id, title, subject:subjects!materials_subject_fk(id, name)").in("id", materialIds) : { data: [] };
  const subjectOf = new Map((materials ?? []).map((material) => [material.id, (material.subject as unknown as { id: string; name: string } | null) ?? null]));
  const distribution: Record<MasteryStatus, number> = { new: 0, weak: 0, learning: 0, developing: 0, strong: 0, mastered: 0 };
  for (const row of practiced) distribution[row.status] += 1;
  const retrievalValues = practiced.map((row) => Number(row.retrieval_strength));
  const fading = practiced.filter((row) => row.next_review_at && row.next_review_at <= new Date().toISOString()).length;

  const points = [...days.values()];
  return {
    today,
    days: points.map((point) => ({ ...point, focusMinutes: Math.round(point.focusMinutes) })),
    totals: {
      sessions: sessionsInWindow,
      focusMinutes: Math.round(points.reduce((sum, point) => sum + point.focusMinutes, 0)),
      // Every answer ever given, counted exactly (the difficulty and confidence breakdowns read the latest 3,000 of each kind).
      questions: counts.answered,
      accuracy: accuracyOf(counts.graded, counts.correct),
      averageScore,
      cards: points.reduce((sum, point) => sum + point.cards, 0),
    },
    scores: scores.slice(0, 12).reverse(),
    byDifficulty: DIFFICULTY_ORDER.map((level) => ({ key: level, label: DIFFICULTY_LABEL[level], ...difficulty.get(level)!, accuracy: accuracyOf(difficulty.get(level)!.answered, difficulty.get(level)!.correct) })),
    byConfidence: CONFIDENCE_ORDER.map((level) => ({ key: level, label: CONFIDENCE_LABEL[level], ...confidence.get(level)!, accuracy: accuracyOf(confidence.get(level)!.answered, confidence.get(level)!.correct) })),
    bySubject: groupMastery(practiced, (row) => {
      const subject = row.concept?.material_id ? subjectOf.get(row.concept.material_id) : null;
      return { id: subject?.id ?? null, name: subject?.name ?? "No subject", href: null };
    }),
    byMaterial: groupMastery(practiced, (row) => (row.concept?.material ? { id: row.concept.material.id, name: row.concept.material.title, href: `/materials/${row.concept.material.id}` } : { id: null, name: "No material", href: null })),
    masteryDistribution: distribution,
    retrieval: { average: retrievalValues.length ? Math.round(retrievalValues.reduce((sum, value) => sum + value, 0) / retrievalValues.length) : null, fading },
  };
});
