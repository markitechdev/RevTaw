/**
 * Experience points and levels (spec §31). Gamification supports learning
 * rather than distracting from it: XP rewards effort and evidence of
 * learning (answers, finished sessions, reviews, mastered concepts, reached
 * goals, active days), never time spent idling. Pure and client-safe.
 */

export const XP_RULES = {
  /** Per answered question (quiz question, recall prompt, problem, stop…). */
  answer: 1,
  /** Extra per correct answer. */
  correctBonus: 1,
  /** A session finished (not stopped early). */
  sessionCompleted: 10,
  /** The first time a concept reaches mastered. */
  conceptMastered: 25,
  /** A daily, weekly or one-off goal reached. */
  goalReached: 15,
  /** Each day with study activity (keeps the streak worth something). */
  activeDay: 5,
  /** Each badge unlocked. */
  achievement: 20,
} as const;

/** XP for a batch of answers: effort plus a bonus for the correct ones. */
export function xpForAnswers(answered: number, correct: number): number {
  const safeAnswered = Math.max(0, Math.round(answered));
  return safeAnswered * XP_RULES.answer + Math.max(0, Math.min(safeAnswered, Math.round(correct))) * XP_RULES.correctBonus;
}

/** XP a finished session earns on top of its answers. */
export function xpForSession(abandoned: boolean): number {
  return abandoned ? 0 : XP_RULES.sessionCompleted;
}

/** Total XP needed to reach a level: 0, 100, 300, 600, 1000, 1500… (each level costs 100 more than the last). */
export function xpToReachLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return 50 * (safe - 1) * safe;
}

export type LevelInfo = {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  span: number;
  /** XP still needed for the next level. */
  toNext: number;
  /** 0-100 progress through the current level. */
  percent: number;
};

export function levelFor(xp: number): LevelInfo {
  const total = Math.max(0, Math.floor(xp));
  let level = 1;
  while (xpToReachLevel(level + 1) <= total) level += 1;
  const start = xpToReachLevel(level);
  const span = xpToReachLevel(level + 1) - start;
  const into = total - start;
  return { level, into, span, toNext: span - into, percent: Math.round((into / span) * 100) };
}

/** Compact XP figures for tiles: 1,284 / 12.9K. */
export function formatXp(xp: number): string {
  if (xp >= 10_000) return `${(xp / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return xp.toLocaleString("en-US");
}
