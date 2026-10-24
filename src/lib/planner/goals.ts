import "server-only";

import { listMastery } from "@/lib/adaptive/engine";
import { addDays, dateIn, weekStartOf } from "@/lib/planner/dates";
import { PlannerError, plannerClock } from "@/lib/planner/service";
import { goalFormSchema } from "@/lib/planner/schemas";
import { GOAL_KIND_BY_ID } from "@/lib/planner/types";
import type { StudyGoalRow } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Study goals (§32): "study 60 minutes today", "complete 50 flashcards this
 * week", "reach 80% mastery of Chapter 4", "finish Chapter 4 before Friday".
 * Progress is computed from the same tables every other feature writes to,
 * so a goal never needs its own counters.
 */

export type GoalProgress = {
  goal: StudyGoalRow & { material: { id: string; title: string } | null };
  current: number;
  target: number;
  percent: number;
  label: string;
  detail: string;
  reached: boolean;
  periodStart: string | null;
  periodEnd: string | null;
};

function periodRange(goal: StudyGoalRow, today: string): { start: string | null; end: string | null } {
  if (goal.period === "day") return { start: today, end: today };
  if (goal.period === "week") {
    const start = weekStartOf(today);
    return { start, end: addDays(start, 6) };
  }
  return { start: null, end: goal.due_date };
}

export function goalTitle(goal: Pick<StudyGoalRow, "kind" | "period" | "target" | "title" | "due_date">, materialTitle: string | null): string {
  if (goal.title) return goal.title;
  const when = goal.period === "day" ? "today" : goal.period === "week" ? "this week" : goal.due_date ? `by ${goal.due_date}` : "";
  switch (goal.kind) {
    case "focus_minutes":
      return `Study ${goal.target} minutes ${when}`.trim();
    case "flashcards_reviewed":
      return `Review ${goal.target} flashcards ${when}`.trim();
    case "questions_answered":
      return `Answer ${goal.target} questions ${when}`.trim();
    case "mastery":
      return `Reach ${goal.target}% mastery of ${materialTitle ?? "the material"}`;
    case "finish_material":
      return `Finish ${materialTitle ?? "the material"} ${when}`.trim();
  }
}

export async function listGoalsWithProgress(): Promise<GoalProgress[]> {
  const supabase = await createClient();
  const { timezone, today } = await plannerClock();
  const { data: goals, error } = await supabase
    .from("study_goals")
    .select("*, material:materials!study_goals_material_fk(id, title)")
    .in("status", ["active", "completed"])
    .order("status")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) {
    console.error("study_goals: list failed", error.message);
    return [];
  }
  const rows = (goals ?? []) as GoalProgress["goal"][];
  if (rows.length === 0) return [];

  // One pass over the evidence tables for the widest period any goal needs.
  const needsActivity = rows.some((goal) => goal.kind !== "mastery" && goal.kind !== "finish_material");
  const earliest = addDays(weekStartOf(today), -7);
  const since = `${earliest}T00:00:00Z`;
  const [{ data: sessions }, { data: reviews }, { data: answers }, { data: items }, mastery] = await Promise.all([
    needsActivity ? supabase.from("study_sessions").select("started_at, completed_at, focus_seconds, status").gte("started_at", since).limit(1000) : Promise.resolve({ data: [] }),
    needsActivity ? supabase.from("flashcard_reviews").select("reviewed_at").gte("reviewed_at", since).limit(2000) : Promise.resolve({ data: [] }),
    needsActivity ? supabase.from("quiz_answers").select("answered_at").gte("answered_at", since).limit(2000) : Promise.resolve({ data: [] }),
    needsActivity ? supabase.from("study_session_items").select("answered_at").gte("answered_at", since).not("answered_at", "is", null).limit(2000) : Promise.resolve({ data: [] }),
    rows.some((goal) => goal.kind === "mastery" || goal.kind === "finish_material") ? listMastery() : Promise.resolve([]),
  ]);

  const inRange = (iso: string | null, start: string | null, end: string | null) => {
    if (!iso) return false;
    const day = dateIn(iso, timezone);
    return (!start || day >= start) && (!end || day <= end);
  };

  const results: GoalProgress[] = [];
  for (const goal of rows) {
    const { start, end } = periodRange(goal, today);
    let current = 0;
    let detail = "";
    switch (goal.kind) {
      case "focus_minutes": {
        const seconds = (sessions ?? []).filter((session) => inRange(session.completed_at ?? session.started_at, start, end)).reduce((sum, session) => sum + session.focus_seconds, 0);
        current = Math.round(seconds / 60);
        detail = `${current} of ${goal.target} min`;
        break;
      }
      case "flashcards_reviewed":
        current = (reviews ?? []).filter((review) => inRange(review.reviewed_at, start, end)).length;
        detail = `${current} of ${goal.target} cards`;
        break;
      case "questions_answered":
        current = (answers ?? []).filter((answer) => inRange(answer.answered_at, start, end)).length + (items ?? []).filter((item) => inRange(item.answered_at, start, end)).length;
        detail = `${current} of ${goal.target} questions`;
        break;
      case "mastery": {
        const rowsFor = mastery.filter((row) => row.concept?.material_id === goal.material_id && row.attempts > 0);
        current = rowsFor.length ? Math.round(rowsFor.reduce((sum, row) => sum + Number(row.mastery), 0) / rowsFor.length) : 0;
        detail = rowsFor.length ? `${current}% average over ${rowsFor.length} concept${rowsFor.length === 1 ? "" : "s"}` : "No concepts practised yet";
        break;
      }
      case "finish_material": {
        const rowsFor = mastery.filter((row) => row.concept?.material_id === goal.material_id && row.attempts > 0);
        const strong = rowsFor.filter((row) => Number(row.mastery) >= 60).length;
        current = goal.status === "completed" ? 1 : rowsFor.length > 0 && strong === rowsFor.length && rowsFor.length >= 3 ? 1 : 0;
        detail = goal.status === "completed" ? "Done" : rowsFor.length ? `${strong} of ${rowsFor.length} concepts strong` : "Not started";
        break;
      }
    }
    const target = goal.target;
    const reached = goal.status === "completed" || current >= target;
    const percent = Math.max(0, Math.min(100, Math.round((Math.min(current, target) / target) * 100)));
    results.push({ goal, current, target, percent, label: goalTitle(goal, goal.material?.title ?? null), detail, reached, periodStart: start, periodEnd: end });
  }

  // Goals that reached their target are closed so they stop nagging and show as achieved.
  const reachedNow = results.filter((item) => item.reached && item.goal.status === "active" && (item.goal.kind === "mastery" || item.goal.kind === "finish_material"));
  for (const item of reachedNow) {
    await supabase.from("study_goals").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", item.goal.id);
    item.goal.status = "completed";
  }
  return results;
}

export async function createGoal(raw: unknown): Promise<{ goalId: string }> {
  const parsed = goalFormSchema.safeParse(raw);
  if (!parsed.success) throw new PlannerError(parsed.error.issues[0]?.message ?? "Check the goal.", 400);
  const input = parsed.data;
  const supabase = await createClient();
  const kind = GOAL_KIND_BY_ID[input.kind];
  const { data, error } = await supabase
    .from("study_goals")
    .insert({
      kind: input.kind,
      period: input.period,
      target: input.kind === "finish_material" ? 1 : input.target,
      material_id: kind.needsMaterial ? input.materialId : null,
      due_date: input.period === "once" ? input.dueDate : null,
      title: input.title || null,
    })
    .select("id")
    .single();
  if (error || !data) throw new PlannerError("The goal could not be saved. Check the material.", 400);
  return { goalId: data.id };
}

export async function completeGoal(goalId: string, completed: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("study_goals").update({ status: completed ? "completed" : "active", completed_at: completed ? new Date().toISOString() : null }).eq("id", goalId);
  if (error) throw new Error(`study_goals: update failed: ${error.message}`);
}

export async function deleteGoal(goalId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("study_goals").delete().eq("id", goalId);
  if (error) throw new Error(`study_goals: delete failed: ${error.message}`);
}
