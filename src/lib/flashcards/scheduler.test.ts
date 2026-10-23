import { describe, expect, it } from "vitest";

import { FsrsState } from "@/lib/engine/fsrs";
import { isDue } from "@/lib/flashcards/labels";
import { cardSnapshot, currentSnapshot, ratingWaits, scheduleCard, scheduleColumns, type CardSchedule } from "@/lib/flashcards/scheduler";

const now = new Date("2026-10-19T08:00:00Z");
const minutes = (count: number) => new Date(now.getTime() + count * 60_000);

const fresh: CardSchedule = {
  fsrs_stability: null,
  fsrs_difficulty: null,
  fsrs_state: null,
  fsrs_learning_steps: 0,
  fsrs_scheduled_days: 0,
  repetitions: 0,
  lapses: 0,
  last_reviewed_at: null,
  due_at: now.toISOString(),
};

describe("flashcard scheduler (FSRS)", () => {
  it("takes a new card through its learning steps before its first interval in days", () => {
    expect(ratingWaits(null, now)).toEqual({ again: "1 min", hard: "6 min", good: "10 min", easy: "8 days" });
    const first = scheduleCard(currentSnapshot(fresh, []), "good", now);
    expect(first.dueAt).toBe(minutes(10).toISOString());
    expect(first.snapshot.state).toBe(FsrsState.Learning);
    expect(first.recallBefore).toBeNull();
    // Shown again later in the session, a second Medium graduates it: back in 2 days, box 2.
    const second = scheduleCard(first.snapshot, "good", minutes(3));
    expect(second.snapshot.state).toBe(FsrsState.Review);
    expect(second.intervalDays).toBe(2);
    expect(second.box).toBe(2);
    expect(isDue(second.dueAt, minutes(60))).toBe(false);
  });

  it("keeps lapses, moves boxes with stability and writes the stored columns", () => {
    let snapshot = scheduleCard(null, "easy", now).snapshot;
    let at = now;
    for (const days of [8, 20, 50]) {
      at = new Date(at.getTime() + days * 86_400_000);
      snapshot = scheduleCard(snapshot, "good", at).snapshot;
    }
    const mature = scheduleCard(snapshot, "good", new Date(at.getTime() + 90 * 86_400_000));
    expect(mature.box).toBe(5);
    expect(mature.recallBefore).toBeGreaterThan(0);
    expect(mature.recallBefore).toBeLessThan(1);
    const lapsed = scheduleCard(mature.snapshot, "again", new Date(mature.dueAt));
    expect(lapsed.snapshot.lapses).toBe(1);
    expect(lapsed.snapshot.state).toBe(FsrsState.Relearning);
    expect(lapsed.box).toBeLessThan(5);
    const columns = scheduleColumns(lapsed);
    expect(columns).toMatchObject({ box: lapsed.box, lapses: 1, fsrs_state: FsrsState.Relearning, due_at: lapsed.dueAt });
    expect(cardSnapshot({ ...fresh, ...columns, last_reviewed_at: mature.dueAt })?.stability).toBe(columns.fsrs_stability);
  });

  it("rebuilds a card scheduled before FSRS from its review history", () => {
    const old = { ...fresh, repetitions: 2, last_reviewed_at: "2026-10-12T08:00:00Z", due_at: "2026-10-15T08:00:00Z" };
    const history = [
      { at: "2026-10-10T08:00:00Z", rating: "good" as const },
      { at: "2026-10-10T08:12:00Z", rating: "good" as const },
      { at: "2026-10-12T08:00:00Z", rating: "good" as const },
    ];
    const rebuilt = currentSnapshot(old, history);
    expect(rebuilt?.state).toBe(FsrsState.Review);
    expect(rebuilt?.reps).toBe(3);
    expect(currentSnapshot(old, [])).toBeNull();
    expect(ratingWaits(rebuilt, now).good).toMatch(/days?|month/);
  });
});
