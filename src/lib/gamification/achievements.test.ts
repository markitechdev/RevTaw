import { describe, expect, it } from "vitest";

import { ACHIEVEMENTS, isUnlocked, longestStreak, newlyUnlocked, type GamificationStats } from "@/lib/gamification/achievements";

const empty: GamificationStats = {
  sessionsCompleted: 0,
  sessionsByMethod: {},
  methodsUsed: 0,
  questionsAnswered: 0,
  correctAnswers: 0,
  flashcardsReviewed: 0,
  currentStreak: 0,
  longestStreak: 0,
  conceptsMastered: 0,
  materials: 0,
  focusMinutes: 0,
  bestQuizPercent: null,
  goalsReached: 0,
  preTestImprovements: 0,
  palaceWalks: 0,
  mnemonicsSaved: 0,
};

describe("achievements", () => {
  it("have unique keys and a target each", () => {
    expect(new Set(ACHIEVEMENTS.map((achievement) => achievement.key)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.every((achievement) => achievement.target !== null && achievement.target > 0)).toBe(true);
    expect(ACHIEVEMENTS.map((achievement) => achievement.title)).toEqual(expect.arrayContaining(["Active Recall Beginner", "100 Questions Answered", "Seven-Day Streak", "First Topic Mastered"]));
  });

  it("unlock nothing for a new student and the right ones as the evidence grows", () => {
    expect(newlyUnlocked(empty, new Set())).toEqual([]);
    const stats: GamificationStats = { ...empty, sessionsCompleted: 1, sessionsByMethod: { active_recall: 1 }, methodsUsed: 1, questionsAnswered: 100, materials: 1, bestQuizPercent: 85 };
    expect(newlyUnlocked(stats, new Set()).map((achievement) => achievement.key).sort()).toEqual(["active_recall_beginner", "first_material", "first_session", "questions_100", "quiz_80"]);
    expect(newlyUnlocked(stats, new Set(["first_session", "first_material"])).map((achievement) => achievement.key)).not.toContain("first_session");
  });

  it("reads streak badges from the longest streak", () => {
    const seven = ACHIEVEMENTS.find((achievement) => achievement.key === "streak_7")!;
    expect(isUnlocked(seven, { ...empty, longestStreak: 7 })).toBe(true);
    expect(isUnlocked(seven, { ...empty, longestStreak: 6, currentStreak: 6 })).toBe(false);
  });

  it("finds the longest run of consecutive days", () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(["2026-10-20"])).toBe(1);
    expect(longestStreak(["2026-10-18", "2026-10-20", "2026-10-19", "2026-10-15", "2026-10-14"])).toBe(3);
    expect(longestStreak(["2026-10-31", "2026-11-01", "2026-11-01"])).toBe(2);
  });
});
