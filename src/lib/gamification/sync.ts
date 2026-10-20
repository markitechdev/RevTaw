import "server-only";

import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { ACHIEVEMENT_BY_KEY, longestStreak, newlyUnlocked, type AchievementDef, type GamificationStats } from "@/lib/gamification/achievements";
import { awardXp } from "@/lib/gamification/service";
import { levelFor, XP_RULES, type LevelInfo } from "@/lib/gamification/xp";
import { routes } from "@/lib/routes";
import { getActivityStats } from "@/lib/study/queries";
import type { Achievement, XpEvent } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Keeps the gamification layer (§31) in step with the evidence: active days
 * earn their XP, badges unlock when their rule is met, and both are announced
 * once. Cheap enough to run on dashboard and progress loads, like the
 * reminder feed.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: value, error } = await query;
  if (error) console.error("gamification: count failed", error.message);
  return value ?? 0;
}

/** The counts the badge rules read, from the same tables every feature writes to. */
export const getGamificationStats = cache(async (): Promise<GamificationStats> => {
  const supabase = await createClient();
  const activity = await getActivityStats();
  const [{ data: sessions }, questions, correctQuestions, items, correctItems, reviews, mastered, materials, { data: attempts }, goals, mnemonics] = await Promise.all([
    supabase.from("study_sessions").select("method, focus_seconds, items_total, summary").eq("status", "completed").limit(2000),
    count(supabase.from("quiz_answers").select("id", { count: "exact", head: true })),
    count(supabase.from("quiz_answers").select("id", { count: "exact", head: true }).eq("is_correct", true)),
    count(supabase.from("study_session_items").select("id", { count: "exact", head: true }).not("answered_at", "is", null)),
    count(supabase.from("study_session_items").select("id", { count: "exact", head: true }).eq("is_correct", true)),
    count(supabase.from("flashcard_reviews").select("id", { count: "exact", head: true })),
    count(supabase.from("concept_mastery").select("concept_id", { count: "exact", head: true }).eq("status", "mastered")),
    count(supabase.from("materials").select("id", { count: "exact", head: true }).is("archived_at", null)),
    supabase.from("quiz_attempts").select("score, max_score").eq("status", "submitted").gt("max_score", 0).order("submitted_at", { ascending: false }).limit(500),
    count(supabase.from("xp_events").select("id", { count: "exact", head: true }).eq("source", "goal")),
    count(supabase.from("mnemonics").select("id", { count: "exact", head: true })),
  ]);
  const byMethod: Record<string, number> = {};
  let focusSeconds = 0;
  let palaceWalks = 0;
  let improvements = 0;
  for (const session of sessions ?? []) {
    byMethod[session.method] = (byMethod[session.method] ?? 0) + 1;
    focusSeconds += session.focus_seconds;
    if (session.method === "memory_palace" && session.items_total > 0) palaceWalks += 1;
    const improvement = (session.summary as { extra?: { improvement?: unknown } } | null)?.extra?.improvement;
    if (session.method === "pre_testing" && typeof improvement === "number" && improvement > 0) improvements += 1;
  }
  const best = (attempts ?? []).reduce<number | null>((top, attempt) => {
    const percent = attempt.max_score ? Math.round(((attempt.score ?? 0) / attempt.max_score) * 100) : null;
    return percent === null ? top : Math.max(top ?? 0, percent);
  }, null);
  return {
    sessionsCompleted: (sessions ?? []).length,
    sessionsByMethod: byMethod,
    methodsUsed: Object.keys(byMethod).length,
    questionsAnswered: questions + items,
    correctAnswers: correctQuestions + correctItems,
    flashcardsReviewed: reviews,
    currentStreak: activity.streakDays,
    longestStreak: Math.max(activity.streakDays, longestStreak(activity.activeDates)),
    conceptsMastered: mastered,
    materials,
    focusMinutes: Math.round(focusSeconds / 60),
    bestQuizPercent: best,
    goalsReached: goals,
    preTestImprovements: improvements,
    palaceWalks,
    mnemonicsSaved: mnemonics,
  };
});

async function awardActiveDays(supabase: Client, activeDates: string[]): Promise<void> {
  if (activeDates.length === 0) return;
  const { data: existing } = await supabase.from("xp_events").select("source_key").eq("source", "streak_day").limit(1000);
  const done = new Set((existing ?? []).map((row) => row.source_key));
  const missing = activeDates.filter((date) => !done.has(`streak_day:${date}`));
  await awardXp(
    missing.map((date) => ({ source: "streak_day" as const, sourceKey: `streak_day:${date}`, points: XP_RULES.activeDay, label: `Studied on ${date}` })),
    supabase,
  );
}

/**
 * Awards the active days and unlocks the badges whose rules are now met.
 * Returns what was unlocked this time (the UI announces it once).
 */
export const syncGamification = cache(async (): Promise<AchievementDef[]> => {
  try {
    const supabase = await createClient();
    const activity = await getActivityStats();
    await awardActiveDays(supabase, activity.activeDates);
    const [stats, { data: rows }] = await Promise.all([getGamificationStats(), supabase.from("achievements").select("key").limit(500)]);
    const unlocked = new Set((rows ?? []).map((row) => row.key));
    const fresh = newlyUnlocked(stats, unlocked);
    if (fresh.length === 0) return [];
    const { data: inserted, error } = await supabase
      .from("achievements")
      .upsert(fresh.map((achievement) => ({ key: achievement.key })), { onConflict: "user_id,key", ignoreDuplicates: true })
      .select("key");
    if (error) {
      console.error("achievements: unlock failed", error.message);
      return [];
    }
    const added = fresh.filter((achievement) => (inserted ?? []).some((row) => row.key === achievement.key));
    if (added.length === 0) return [];
    await awardXp(
      added.map((achievement) => ({ source: "achievement" as const, sourceKey: `achievement:${achievement.key}`, points: XP_RULES.achievement, label: `Badge: ${achievement.title}` })),
      supabase,
    );
    await supabase.from("notifications").upsert(
      added.map((achievement) => ({ kind: "achievement" as const, title: `Badge unlocked: ${achievement.title}`, body: achievement.description, href: `${routes.progress}/achievements`, dedupe_key: `achievement:${achievement.key}` })),
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
    return added;
  } catch (error) {
    unstable_rethrow(error);
    console.error("gamification: sync failed", error);
    return [];
  }
});

export type GamificationView = {
  xp: number;
  level: LevelInfo;
  streakDays: number;
  achievements: Array<{ achievement: AchievementDef; unlockedAt: string | null; progress: number }>;
  unlockedCount: number;
  recentXp: XpEvent[];
};

/** Level, badges (with progress towards the locked ones) and the latest XP entries. */
export const getGamificationView = cache(async (): Promise<GamificationView> => {
  const supabase = await createClient();
  const [{ data: profile }, { data: unlocked }, { data: events }, stats] = await Promise.all([
    supabase.from("profiles").select("xp").maybeSingle(),
    supabase.from("achievements").select("*").order("unlocked_at", { ascending: false }).limit(500),
    supabase.from("xp_events").select("*").order("created_at", { ascending: false }).limit(12),
    getGamificationStats(),
  ]);
  const byKey = new Map(((unlocked ?? []) as Achievement[]).map((row) => [row.key, row]));
  const achievements = Object.values(ACHIEVEMENT_BY_KEY).map((achievement) => ({ achievement, unlockedAt: byKey.get(achievement.key)?.unlocked_at ?? null, progress: achievement.progress(stats) }));
  const xp = profile?.xp ?? 0;
  return { xp, level: levelFor(xp), streakDays: stats.currentStreak, achievements, unlockedCount: byKey.size, recentXp: (events ?? []) as XpEvent[] };
});
