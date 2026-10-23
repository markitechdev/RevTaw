import "server-only";

import { cache } from "react";

import { ACHIEVEMENT_BY_KEY, type AchievementDef } from "@/lib/gamification/achievements";
import { levelFor, type LevelInfo } from "@/lib/gamification/xp";
import { createClient } from "@/lib/supabase/server";

/** What the user card shows under the name: level, XP and the latest badges. */
export type Standing = {
  xp: number;
  level: LevelInfo;
  /** Badges unlocked so far. */
  badges: number;
  /** The most recent ones, newest first (up to three). */
  recent: AchievementDef[];
};

const RECENT_BADGES = 3;

/**
 * Two small reads for every signed-in screen: the XP total the profile keeps
 * and the newest badges with the count. Badges unlock where their evidence
 * is shown (Home, Progress); this only reads. Never throws: a failed read
 * shows level 1 rather than breaking the layout.
 */
export const getStanding = cache(async (userId: string): Promise<Standing> => {
  const supabase = await createClient();
  const [profile, badges] = await Promise.all([
    supabase.from("profiles").select("xp").eq("id", userId).maybeSingle(),
    supabase.from("achievements").select("key", { count: "exact" }).eq("user_id", userId).order("unlocked_at", { ascending: false }).limit(RECENT_BADGES),
  ]);
  if (profile.error) console.error("standing: profile read failed", profile.error.message);
  if (badges.error) console.error("standing: badges read failed", badges.error.message);
  const xp = profile.data?.xp ?? 0;
  const recent = (badges.data ?? []).map((row) => ACHIEVEMENT_BY_KEY[row.key]).filter((achievement): achievement is AchievementDef => Boolean(achievement));
  return { xp, level: levelFor(xp), badges: badges.count ?? recent.length, recent };
});
