import "server-only";

import { unstable_rethrow } from "next/navigation";

import { inAppAllowed } from "@/lib/notifications/allowed";
import { routes } from "@/lib/routes";
import { levelFor, XP_RULES, xpForAnswers, xpForSession } from "@/lib/gamification/xp";
import type { XpSource } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { clampText } from "@/lib/text/clamp";

/**
 * Awarding XP (§31). Every award names its source, so awarding is idempotent
 * — a session finished twice, a request retried or a sync re-run never
 * doubles up — and the ledger explains where every point came from. The
 * profile keeps the running total by trigger.
 */

export type XpAward = { source: XpSource; sourceKey: string; points: number; label?: string | null };

type Client = Awaited<ReturnType<typeof createClient>>;

/** Inserts the awards that are new and returns the points that were actually added. Never throws. */
export async function awardXp(awards: XpAward[], supabase?: Client): Promise<number> {
  const rows = awards.filter((award) => award.points > 0);
  if (rows.length === 0) return 0;
  try {
    const client = supabase ?? (await createClient());
    const { data: profile } = await client.from("profiles").select("id, xp").maybeSingle();
    if (!profile) return 0;
    const { data, error } = await client
      .from("xp_events")
      .upsert(
        rows.map((award) => ({ user_id: profile.id, source: award.source, source_key: award.sourceKey.slice(0, 160), points: Math.min(1000, Math.round(award.points)), label: award.label ? clampText(award.label, 160) : null })),
        { onConflict: "user_id,source_key", ignoreDuplicates: true },
      )
      .select("points");
    if (error) {
      console.error("xp_events: award failed", error.message);
      return 0;
    }
    const added = (data ?? []).reduce((sum, row) => sum + row.points, 0);
    if (added > 0) {
      // The total after this award, read back (the trigger has added it): another award at the same moment is in it
      // too, so the one that carries the total over a level line always announces it.
      const { data: fresh } = await client.from("profiles").select("xp").eq("id", profile.id).maybeSingle();
      const after = Math.max(fresh?.xp ?? 0, profile.xp + added);
      await announceLevelUp(client, after - added, after);
    }
    return added;
  } catch (error) {
    unstable_rethrow(error);
    console.error("xp_events: award failed", error);
    return 0;
  }
}

async function announceLevelUp(supabase: Client, before: number, after: number): Promise<void> {
  const from = levelFor(before).level;
  const to = levelFor(after).level;
  if (to <= from || !(await inAppAllowed("level_up"))) return;
  await supabase
    .from("notifications")
    .upsert({ kind: "level_up", title: `Level ${to} reached`, body: `${after.toLocaleString("en-US")} XP so far. Levels come from answers, finished sessions, mastered concepts, goals and active days.`, href: routes.progress, dedupe_key: `level:${to}` }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
}

/** A finished session: effort and correct answers, plus the completion bonus unless it was stopped early. */
export async function awardSessionXp(supabase: Client, session: { id: string; title: string; method: string }, counts: { answered: number; correct: number; abandoned: boolean; answersAlreadyRewarded: boolean }): Promise<void> {
  const points = xpForSession(counts.abandoned) + (counts.answersAlreadyRewarded ? 0 : xpForAnswers(counts.answered, counts.correct));
  await awardXp([{ source: "session", sourceKey: `session:${session.id}`, points, label: counts.abandoned ? `${session.title} (stopped early)` : session.title }], supabase);
}

/** A submitted quiz attempt (inside a session or not). */
export async function awardAttemptXp(supabase: Client, attempt: { id: string; title: string | null }, counts: { answered: number; correct: number }): Promise<void> {
  await awardXp([{ source: "answers", sourceKey: `attempt:${attempt.id}`, points: xpForAnswers(counts.answered, counts.correct), label: attempt.title ? `Quiz: ${attempt.title}` : "Quiz attempt" }], supabase);
}

/** Concepts that just reached mastered (first time only, by key). */
export async function awardMasteredXp(supabase: Client, concepts: Array<{ id: string; name: string }>): Promise<void> {
  if (concepts.length === 0) return;
  await awardXp(
    concepts.map((concept) => ({ source: "mastered" as const, sourceKey: `mastered:${concept.id}`, points: XP_RULES.conceptMastered, label: `Mastered ${concept.name}` })),
    supabase,
  );
}

/** A goal reached (once per goal and period). */
export async function awardGoalXp(supabase: Client, goal: { id: string; label: string; periodKey: string }): Promise<void> {
  await awardXp([{ source: "goal", sourceKey: `goal:${goal.id}:${goal.periodKey}`, points: XP_RULES.goalReached, label: `Goal reached: ${goal.label}` }], supabase);
}
