import { describe, expect, it } from "vitest";

import { formatXp, levelFor, XP_RULES, xpForAnswers, xpForSession, xpToReachLevel } from "@/lib/gamification/xp";

describe("XP rules", () => {
  it("rewards effort and correct answers", () => {
    expect(xpForAnswers(10, 7)).toBe(17);
    expect(xpForAnswers(10, 12)).toBe(20);
    expect(xpForAnswers(0, 0)).toBe(0);
    expect(xpForAnswers(-3, 2)).toBe(0);
  });

  it("gives the session bonus only when the session was finished", () => {
    expect(xpForSession(false)).toBe(XP_RULES.sessionCompleted);
    expect(xpForSession(true)).toBe(0);
  });

  it("levels cost 100 more XP each time", () => {
    expect([1, 2, 3, 4, 5].map(xpToReachLevel)).toEqual([0, 100, 300, 600, 1000]);
    expect(levelFor(0)).toEqual({ level: 1, into: 0, span: 100, toNext: 100, percent: 0 });
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100)).toMatchObject({ level: 2, into: 0, span: 200, toNext: 200 });
    expect(levelFor(450)).toMatchObject({ level: 3, into: 150, span: 300, toNext: 150, percent: 50 });
    expect(levelFor(1000).level).toBe(5);
  });

  it("formats XP compactly", () => {
    expect(formatXp(1284)).toBe("1,284");
    expect(formatXp(12_900)).toBe("12.9K");
    expect(formatXp(20_000)).toBe("20K");
  });
});
