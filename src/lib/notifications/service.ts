import "server-only";

import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { awardGoalXp } from "@/lib/gamification/service";
import { inAppAllowed } from "@/lib/notifications/allowed";
import { hourIn } from "@/lib/planner/dates";
import { listGoalsWithProgress } from "@/lib/planner/goals";
import { getDueToday, listExams } from "@/lib/planner/queries";
import { plannerClock } from "@/lib/planner/service";
import { routes } from "@/lib/routes";
import { getActivityStats } from "@/lib/study/queries";
import type { Notification, NotificationKind } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Internal notification/reminder feed (§35). Reminders are generated
 * server-side from the planner's own data with a deduplication key, so each
 * one exists once; a later email/push channel only has to read these rows.
 */

export type NotificationInput = { kind: NotificationKind; title: string; body?: string | null; href?: string | null; dedupeKey: string };

export async function notify(input: NotificationInput): Promise<boolean> {
  // Settings → Notifications: in-app reminders off, or this kind muted.
  if (!(await inAppAllowed(input.kind))) return false;
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("notifications")
    .upsert({ kind: input.kind, title: input.title.slice(0, 160), body: input.body?.slice(0, 600) ?? null, href: input.href ?? null, dedupe_key: input.dedupeKey.slice(0, 120) }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("notifications: insert failed", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Generates today's reminders: reviews due, upcoming exams (7/3/1/0 days),
 * plan tasks for today, daily goals reached and a streak at risk in the
 * evening. Cheap enough to run on dashboard and planner loads.
 */
export const syncNotifications = cache(async (): Promise<number> => {
  try {
    const { timezone, today } = await plannerClock();
    const [due, exams, goals, activity] = await Promise.all([getDueToday(), listExams(), listGoalsWithProgress(), getActivityStats()]);
    let created = 0;

    if (due.dueCards > 0 || due.dueConcepts.length > 0) {
      const parts = [due.dueCards > 0 ? `${due.dueCards} flashcard${due.dueCards === 1 ? "" : "s"}` : null, due.dueConcepts.length > 0 ? `${due.dueConcepts.length} concept${due.dueConcepts.length === 1 ? "" : "s"} fading` : null].filter(Boolean);
      if (await notify({ kind: "review_due", title: "Reviews due today", body: `${parts.join(" and ")} — a short review keeps them from slipping.`, href: due.dueCards > 0 ? `${routes.flashcards}/review` : routes.progress, dedupeKey: `review_due:${today}` })) created += 1;
    }

    for (const exam of exams) {
      if (![7, 3, 1, 0].includes(exam.daysLeft)) continue;
      const when = exam.daysLeft === 0 ? "is today" : exam.daysLeft === 1 ? "is tomorrow" : `is in ${exam.daysLeft} days`;
      const body = exam.daysLeft === 0 ? "Keep the rapid review short and stop early — you have done the work." : exam.readiness !== null ? `Readiness ${exam.readiness}% · ${exam.tasksDone} of ${exam.tasksTotal} plan tasks done.` : "Open the plan to see what is scheduled.";
      if (await notify({ kind: "exam_upcoming", title: `${exam.title} ${when}`, body, href: `${routes.planner}/${exam.id}`, dedupeKey: `exam:${exam.id}:${exam.daysLeft}` })) created += 1;
    }

    const pendingToday = due.tasks.filter((task) => task.status === "pending");
    if (pendingToday.length > 0) {
      const minutes = pendingToday.reduce((sum, task) => sum + task.minutes, 0);
      if (await notify({ kind: "plan_reminder", title: `${pendingToday.length} planned task${pendingToday.length === 1 ? "" : "s"} today`, body: `${minutes} minutes: ${pendingToday.slice(0, 3).map((task) => task.title).join(", ")}${pendingToday.length > 3 ? "…" : ""}`, href: routes.planner, dedupeKey: `plan:${today}` })) created += 1;
    }

    const supabase = await createClient();
    for (const goal of goals) {
      if (!goal.reached) continue;
      const periodKey = goal.goal.period === "day" ? today : goal.goal.period === "week" ? (goal.periodStart ?? today) : "once";
      await awardGoalXp(supabase, { id: goal.goal.id, label: goal.label, periodKey });
      if (goal.goal.period === "once") continue;
      const key = `goal:${goal.goal.id}:${periodKey}`;
      if (await notify({ kind: "daily_goal", title: `Goal reached: ${goal.label}`, body: goal.detail, href: routes.planner, dedupeKey: key })) created += 1;
    }

    const activeToday = activity.activeDates.includes(today);
    if (!activeToday && activity.streakDays >= 2 && hourIn(new Date(), timezone) >= 18) {
      if (await notify({ kind: "streak", title: `Your ${activity.streakDays}-day streak ends at midnight`, body: "One short session — even five minutes of flashcards — keeps it alive.", href: routes.study, dedupeKey: `streak:${today}` })) created += 1;
    }
    return created;
  } catch (error) {
    unstable_rethrow(error);
    console.error("notifications: sync failed", error);
    return 0;
  }
});

export const listNotifications = cache(async (limit = 12): Promise<Notification[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) {
    console.error("notifications: list failed", error.message);
    return [];
  }
  return data ?? [];
});

export const countUnreadNotifications = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
});

export async function markNotificationsRead(ids: string[] | "all"): Promise<void> {
  const supabase = await createClient();
  let query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (ids !== "all") query = query.in("id", ids);
  const { error } = await query;
  if (error) throw new Error(`notifications: mark read failed: ${error.message}`);
}
