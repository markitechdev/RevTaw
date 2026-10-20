import { describe, expect, it } from "vitest";

import { computeMastery, difficultyFor, statusFor, type EvidenceEvent } from "@/lib/adaptive/mastery";

const now = new Date("2026-10-19T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

function series(pattern: string, kind: EvidenceEvent["kind"] = "quiz", spacingDays = 1): EvidenceEvent[] {
  return [...pattern].map((char, index) => ({ at: daysAgo((pattern.length - index) * spacingDays), kind, correct: char === "1", difficulty: "medium" }));
}

describe("computeMastery", () => {
  it("is empty for a concept with no evidence", () => {
    const result = computeMastery({ events: [], openMistakes: 0, now });
    expect(result).toMatchObject({ mastery: 0, status: "new", nextDifficulty: "easy", attempts: 0, retrievalStrength: 0, nextReviewAt: null });
  });

  it("reaches mastered after a consistent run of correct answers", () => {
    const result = computeMastery({ events: series("1111111"), openMistakes: 0, now });
    expect(result.mastery).toBeGreaterThanOrEqual(80);
    expect(result.status).toBe("mastered");
    expect(result.nextDifficulty).toBe("advanced");
    expect(result.streak).toBe(7);
    expect(result.retrievalStrength).toBeGreaterThan(50);
  });

  it("stays cautious with little evidence even when it is all correct", () => {
    const result = computeMastery({ events: series("11"), openMistakes: 0, now });
    expect(result.mastery).toBeLessThan(80);
    expect(result.status).toBe("strong");
  });

  it("weights recent misses more than old ones", () => {
    const recentMisses = computeMastery({ events: series("111100"), openMistakes: 0, now });
    const oldMisses = computeMastery({ events: series("001111"), openMistakes: 0, now });
    expect(recentMisses.mastery).toBeLessThan(oldMisses.mastery);
    expect(recentMisses.trend).toBeLessThan(0);
    expect(oldMisses.trend).toBeGreaterThan(0);
  });

  it("penalises open mistakes and confident wrong answers", () => {
    const clean = computeMastery({ events: series("1101"), openMistakes: 0, now });
    const withMistakes = computeMastery({ events: series("1101"), openMistakes: 2, now });
    expect(withMistakes.mastery).toBe(Math.max(0, clean.mastery - 10));
    const confidentWrong = computeMastery({
      events: [
        { at: daysAgo(2), kind: "quiz", correct: false, confidence: "very_confident" },
        { at: daysAgo(1), kind: "quiz", correct: true, confidence: "guessing" },
      ],
      openMistakes: 0,
      now,
    });
    expect(confidentWrong.misconceptions).toBe(1);
    expect(confidentWrong.underconfident).toBe(1);
    expect(confidentWrong.avgConfidence).toBe(2.5);
  });

  it("decays retrieval strength over time and schedules the next review", () => {
    const fresh = computeMastery({ events: series("1111", "flashcard", 1), openMistakes: 0, now });
    const stale = computeMastery({ events: series("1111", "flashcard", 1).map((event) => ({ ...event, at: daysAgo(40) })), openMistakes: 0, now });
    expect(stale.retrievalStrength).toBeLessThan(fresh.retrievalStrength);
    expect(fresh.nextReviewAt).not.toBeNull();
    const missed = computeMastery({ events: series("1110"), openMistakes: 0, now });
    expect(new Date(missed.nextReviewAt!).getTime() - new Date(missed.lastPracticedAt!).getTime()).toBe(86_400_000);
  });

  it("maps mastery to status and progressive difficulty", () => {
    expect(statusFor(30, 3)).toBe("weak");
    expect(statusFor(45, 3)).toBe("learning");
    expect(statusFor(70, 3)).toBe("strong");
    expect(statusFor(85, 3)).toBe("mastered");
    expect(difficultyFor(30, 3)).toBe("easy");
    expect(difficultyFor(50, 3)).toBe("medium");
    expect(difficultyFor(75, 3)).toBe("hard");
    expect(difficultyFor(90, 3)).toBe("advanced");
  });
});
