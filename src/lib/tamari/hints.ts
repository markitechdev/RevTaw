import "server-only";

import { getMasterySummary } from "@/lib/adaptive/engine";
import { hourIn } from "@/lib/planner/dates";
import { getDueToday, getNextExam } from "@/lib/planner/queries";
import { plannerClock } from "@/lib/planner/service";
import type { ResponseLanguage } from "@/lib/preferences/schema";
import { getActivityStats } from "@/lib/study/queries";
import { parseSessionSummary } from "@/lib/study/sessions";
import { createClient } from "@/lib/supabase/server";
import { listGoalsWithProgress } from "@/lib/planner/goals";
import { cardsLine, examLine, goalLine, improvementLine, planFinishedLine, repeatedLine, reviewsLine, streakLine, weakestLine } from "@/lib/tamari/coach";
import { tamariLanguage, type TamariBubble } from "@/lib/tamari/lines";

/** A quiz counts as "improved" by this many points over the previous one on the same material, ending at least here. */
const IMPROVED_BY = 10;
const IMPROVED_TO = 70;
/** News this fresh is still worth saying. */
const FRESH_MS = 2 * 86_400_000;

/** The concept missed most often in the last 30 days, three times or more, with a mistake still open. */
async function mostMissedConcept(): Promise<{ id: string; name: string; count: number; materialId: string | null } | null> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("mistakes")
    .select("concept_id, material_id, resolved_at, concept:concepts!mistakes_concept_fk(name)")
    .gte("created_at", since)
    .not("concept_id", "is", null)
    .limit(500);
  const counts = new Map<string, { id: string; name: string; count: number; open: boolean; materialId: string | null }>();
  for (const row of (data ?? []) as unknown as Array<{ concept_id: string; material_id: string | null; resolved_at: string | null; concept: { name: string } | null }>) {
    if (!row.concept?.name) continue;
    const entry = counts.get(row.concept_id) ?? { id: row.concept_id, name: row.concept.name, count: 0, open: false, materialId: row.material_id };
    entry.count += 1;
    entry.open ||= !row.resolved_at;
    counts.set(row.concept_id, entry);
  }
  const top = [...counts.values()].filter((entry) => entry.open && entry.count >= 3).sort((a, b) => b.count - a.count)[0];
  return top ? { id: top.id, name: top.name, count: top.count, materialId: top.materialId } : null;
}

/** The latest quiz, when it clearly beat the previous one on the same material. */
async function freshImprovement(): Promise<{ attemptId: string; from: number; to: number; materialId: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quiz_attempts")
    .select("id, correct_count, question_count, submitted_at, quiz:quizzes!quiz_attempts_quiz_fk(material_id)")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(12);
  const rows = ((data ?? []) as unknown as Array<{ id: string; correct_count: number | null; question_count: number; submitted_at: string | null; quiz: { material_id: string | null } | null }>).filter((row) => row.question_count > 0 && row.submitted_at);
  const latest = rows[0];
  if (!latest || Date.now() - new Date(latest.submitted_at!).getTime() > FRESH_MS) return null;
  const materialId = latest.quiz?.material_id ?? null;
  const previous = rows.slice(1).find((row) => (row.quiz?.material_id ?? null) === materialId);
  if (!previous) return null;
  const percent = (row: (typeof rows)[number]) => Math.round(((row.correct_count ?? 0) / row.question_count) * 100);
  const [from, to] = [percent(previous), percent(latest)];
  return to >= IMPROVED_TO && to >= from + IMPROVED_BY ? { attemptId: latest.id, from, to, materialId } : null;
}

/** A plan of Tamari's finished in the last day, with how it went. */
async function finishedPlan(): Promise<{ sessionId: string; correct: number; answered: number; firstAccuracy: number | null; lastAccuracy: number | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_sessions")
    .select("id, summary, completed_at")
    .eq("method", "smart_study")
    .eq("status", "completed")
    .gte("completed_at", new Date(Date.now() - 86_400_000).toISOString())
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const summary = data ? parseSessionSummary(data.summary) : null;
  if (!data || !summary || summary.questionsAnswered === 0) return null;
  const extra = (summary.extra ?? {}) as { firstAccuracy?: unknown; lastAccuracy?: unknown };
  const accuracy = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return { sessionId: data.id, correct: summary.correct, answered: summary.questionsAnswered, firstAccuracy: accuracy(extra.firstAccuracy), lastAccuracy: accuracy(extra.lastAccuracy) };
}

/** A study goal reached this period (or a one-off goal completed in the last day). */
async function reachedGoal(): Promise<{ id: string; label: string } | null> {
  const goals = await listGoalsWithProgress();
  const fresh = goals.find((item) => item.reached && (item.goal.status === "active" || (item.goal.completed_at !== null && Date.now() - new Date(item.goal.completed_at).getTime() < 86_400_000)));
  return fresh ? { id: `${fresh.goal.id}:${fresh.periodStart ?? "once"}`, label: fresh.label } : null;
}

/**
 * Tamari's line on Home, most urgent first (companion doc §3–§4): an exam
 * today or tomorrow, a streak that ends tonight, a concept missed three times
 * or more, an exam within three days, today's planned reviews, cards due, a
 * plan finished today, a goal reached, a clear improvement, then the weakest
 * topic. Lines the
 * student put off with "Later" today are skipped — Tamari then offers to plan
 * their time instead of saying the next thing. Reads what the Home widgets
 * read (cached per request), after the day's plan adjustment.
 */
export async function homeLine(language: ResponseLanguage, planning: Promise<unknown>, later: string[]): Promise<TamariBubble | null> {
  await planning;
  const [clock, activity, due, exam, mastery, missed, better, finished, goal] = await Promise.all([
    plannerClock(),
    getActivityStats(),
    getDueToday(),
    getNextExam(),
    getMasterySummary(),
    mostMissedConcept(),
    freshImprovement(),
    finishedPlan(),
    reachedGoal(),
  ]);
  const lang = tamariLanguage(language);
  const pick = (line: TamariBubble | null): TamariBubble | null => (line && !later.includes(line.id) ? line : null);
  const lines: Array<() => TamariBubble | null> = [
    () => (exam && exam.daysLeft >= 0 && exam.daysLeft <= 1 ? examLine(lang, exam) : null),
    () => (activity.streakDays >= 2 && !activity.activeDates.includes(clock.today) && hourIn(new Date(), clock.timezone) >= 18 ? streakLine(lang, activity.streakDays, clock.today) : null),
    () => (missed ? repeatedLine(lang, missed) : null),
    () => (exam && exam.daysLeft >= 2 && exam.daysLeft <= 3 ? examLine(lang, exam) : null),
    () => {
      const open = due.tasks.filter((task) => task.method !== "activity" && task.status !== "done" && task.status !== "skipped");
      return open.length > 0 ? reviewsLine(lang, { count: open.length, taskId: open[0].id, topic: open[0].material?.title ?? null }, clock.today) : null;
    },
    () => (due.dueCards > 0 ? cardsLine(lang, due.dueCards, clock.today) : null),
    () => (finished ? planFinishedLine(lang, finished) : null),
    () => (goal ? goalLine(lang, goal) : null),
    () => (better ? improvementLine(lang, better) : null),
    () => {
      const weakest = mastery.needsWork.find((row) => row.concept);
      return weakest?.concept ? weakestLine(lang, { id: weakest.concept.id, name: weakest.concept.name, materialId: weakest.concept.material_id }) : null;
    },
  ];
  // The most urgent line, unless the student said "Later" to it today.
  for (const line of lines) {
    const candidate = line();
    if (candidate) return pick(candidate);
  }
  return null;
}
