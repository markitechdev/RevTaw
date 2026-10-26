import { describe, expect, it } from "vitest";

import { pomodoroSplit } from "@/lib/study/pomodoro";

describe("pomodoroSplit", () => {
  it("makes a block shorter than a round one focus period of its length", () => {
    expect(pomodoroSplit(15)).toEqual({ workMinutes: 15, breakMinutes: 5 });
    expect(pomodoroSplit(25)).toEqual({ workMinutes: 25, breakMinutes: 5 });
  });

  it("fills a longer block with rounds of about 25 minutes and 5-minute breaks", () => {
    expect(pomodoroSplit(30)).toEqual({ workMinutes: 25, breakMinutes: 5 });
    expect(pomodoroSplit(50)).toEqual({ workMinutes: 20, breakMinutes: 5 });
    expect(pomodoroSplit(60)).toEqual({ workMinutes: 25, breakMinutes: 5 });
    expect(pomodoroSplit(90)).toEqual({ workMinutes: 25, breakMinutes: 5 });
  });

  it("keeps the whole block about its length", () => {
    for (const minutes of [30, 35, 40, 45, 50, 55, 60, 75, 90, 120, 240]) {
      const { workMinutes, breakMinutes } = pomodoroSplit(minutes);
      const rounds = Math.max(1, Math.round(minutes / 30));
      expect(Math.abs(rounds * (workMinutes + breakMinutes) - minutes)).toBeLessThanOrEqual(5);
    }
  });
});
