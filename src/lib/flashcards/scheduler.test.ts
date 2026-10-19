import { describe, expect, it } from "vitest";

import { describeInterval, isDue, schedule, type SchedulerState } from "@/lib/flashcards/scheduler";

const fresh: SchedulerState = { box: 1, ease: 2.5, interval_days: 0, repetitions: 0, lapses: 0 };
const now = new Date("2026-10-19T08:00:00Z");

describe("flashcard scheduler", () => {
  it("follows the ladder for repeated good answers and climbs the boxes", () => {
    const first = schedule(fresh, "good", now);
    expect(first).toMatchObject({ box: 2, interval_days: 1, repetitions: 1 });
    expect(first.due_at).toBe("2026-10-20T08:00:00.000Z");
    const second = schedule(first, "good", now);
    expect(second).toMatchObject({ box: 3, interval_days: 3, repetitions: 2 });
    const third = schedule(second, "good", now);
    expect(third).toMatchObject({ box: 4, interval_days: 8, repetitions: 3 });
    const fourth = schedule(third, "good", now);
    expect(fourth.box).toBe(5);
    expect(schedule(fourth, "good", now).box).toBe(5);
  });

  it("resets to box 1 with a short delay after a lapse and lowers ease", () => {
    const strong: SchedulerState = { box: 4, ease: 2.5, interval_days: 14, repetitions: 4, lapses: 0 };
    const lapsed = schedule(strong, "again", now);
    expect(lapsed).toMatchObject({ box: 1, interval_days: 0, repetitions: 0, lapses: 1, ease: 2.3 });
    expect(lapsed.due_at).toBe("2026-10-19T08:10:00.000Z");
    expect(isDue(lapsed.due_at, now)).toBe(false);
    expect(isDue(lapsed.due_at, new Date("2026-10-19T08:11:00Z"))).toBe(true);
  });

  it("keeps the box on hard, grows faster on easy and never drops below the minimum ease", () => {
    const learning: SchedulerState = { box: 2, ease: 1.35, interval_days: 3, repetitions: 2, lapses: 2 };
    expect(schedule(learning, "hard", now)).toMatchObject({ box: 2, ease: 1.3, interval_days: 4 });
    expect(schedule(fresh, "easy", now)).toMatchObject({ box: 2, interval_days: 3, ease: 2.65 });
    const mature: SchedulerState = { box: 5, ease: 2.5, interval_days: 200, repetitions: 8, lapses: 0 };
    expect(schedule(mature, "easy", now).interval_days).toBe(365);
  });

  it("describes what each button will do", () => {
    expect(describeInterval(fresh, "again")).toBe("10 min");
    expect(describeInterval(fresh, "good")).toBe("1 day");
    expect(describeInterval(fresh, "easy")).toBe("3 days");
    expect(describeInterval({ box: 5, ease: 2.5, interval_days: 40, repetitions: 5, lapses: 0 }, "good")).toBe("3 months");
  });
});
