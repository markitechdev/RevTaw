import { describe, expect, it } from "vitest";

import { median, readAnswer } from "@/lib/engine/answers";
import { bktUpdate, guessFloor, paramsFor, predictedCorrect } from "@/lib/engine/bkt";
import { chooseDifficulty, fitBucketDifficulty, kFactor, successProbability, targetSuccess } from "@/lib/engine/elo";
import { describeWait, leitnerBox, preview, recallAt, replay, review, FsrsState } from "@/lib/engine/fsrs";
import { modelConcept, type EngineEvent } from "@/lib/engine/mastery-model";
import { chooseMethod, PLAN_METHODS } from "@/lib/engine/method-rules";
import { conceptsPerPlan, dueness, priorityScore, rankByPriority, urgency } from "@/lib/engine/priority";
import { isWeak, repeatedMisses, weaknessScore } from "@/lib/engine/weakness";
import { BUILDER_METHOD_IDS } from "@/lib/study/catalog";
import type { StudyMethodId } from "@/lib/study/methods";

const TZ = "Asia/Manila";

let counter = 0;
function answer(at: string, correct: boolean, extra: Partial<EngineEvent> = {}): EngineEvent {
  counter += 1;
  return {
    at,
    kind: "quiz",
    itemKey: `q${counter}`,
    correct,
    difficulty: "medium",
    questionType: "multiple_choice",
    optionCount: 4,
    firstAttempt: true,
    confidence: "somewhat_confident",
    responseMs: 20_000,
    ...extra,
  };
}

describe("BKT (§7)", () => {
  const run = (type: string, options: number | null) => [1, 2, 3].reduce((p) => bktUpdate(p, true, paramsFor(type, options, "medium")), 0.2);

  it("takes three right answers in a row from 0.20 to the doc's values", () => {
    expect(run("multiple_choice", 4)).toBeCloseTo(0.96, 2);
    expect(run("true_false", 2)).toBeCloseTo(0.79, 2);
    expect(run("identification", null)).toBeCloseTo(1, 2);
  });

  it("lets quarter-weight wrong guesses nudge P(L) down, not up", () => {
    const params = paramsFor("multiple_choice", 4, "medium");
    let p = 0.5;
    for (let i = 0; i < 3; i += 1) p = bktUpdate(p, false, params, 0.25);
    expect(p).toBeLessThan(0.5);
    expect(p).toBeGreaterThan(bktUpdate(0.5, false, params, 1) - 0.2);
  });

  it("sets guess by question type and predicts correctness for calibration", () => {
    expect(guessFloor("multiple_choice", 4)).toBe(0.25);
    expect(guessFloor("true_false", 2)).toBe(0.5);
    expect(guessFloor("identification", null)).toBe(0);
    expect(predictedCorrect(1, 1, { guess: 0.25, slip: 0.1 })).toBeCloseTo(0.9);
    expect(predictedCorrect(0, 1, { guess: 0.25, slip: 0.1 })).toBeCloseTo(0.25);
  });
});

describe("reading an answer (§6)", () => {
  it("tells misconceptions, gaps, rapid guesses, fragile and known answers apart", () => {
    expect(readAnswer({ correct: false, confidence: "very_confident", responseMs: 20_000, medianMs: 20_000 })).toMatchObject({ reading: "misconception", weight: 1, grade: "again" });
    expect(readAnswer({ correct: false, confidence: "unsure", responseMs: 20_000 })).toMatchObject({ reading: "gap", grade: "again" });
    expect(readAnswer({ correct: true, confidence: "very_confident", responseMs: 2_000, medianMs: 20_000 })).toMatchObject({ reading: "rapid_guess", weight: 0.25 });
    expect(readAnswer({ correct: true, confidence: "guessing", responseMs: 20_000 })).toMatchObject({ reading: "fragile", weight: 0.5, grade: "hard" });
    expect(readAnswer({ correct: true, confidence: null, responseMs: null })).toMatchObject({ reading: "known", grade: "good" });
  });

  it("needs five timed answers for a median", () => {
    expect(median([1, 2, 3, 4])).toBeNull();
    expect(median([5, 1, 3, 2, 4])).toBe(3);
  });
});

describe("Elo (§8)", () => {
  it("shrinks K with answers but never below 0.2", () => {
    expect(kFactor(0)).toBe(1);
    expect(kFactor(10)).toBeCloseTo(0.667, 3);
    expect(kFactor(1000)).toBe(0.2);
  });

  it("keeps the guessing floor and aims the next question at the target", () => {
    expect(successProbability(0, 0, 0.25)).toBeCloseTo(0.625, 3);
    expect(successProbability(-10, 0, 0.25)).toBeCloseTo(0.25, 2);
    const options = (["easy", "medium", "hard"] as const).map((label, index) => ({ label, difficulty: index - 1, guessFloor: 0.25 }));
    expect(chooseDifficulty(0, options, 0.85, false).label).toBe("easy");
    expect(chooseDifficulty(0, options, 0.62, false).label).toBe("medium");
    expect(chooseDifficulty(3, options, 0.62, true).label).toBe("advanced");
    expect(targetSuccess({ status: "weak", attempts: 5, missesInARow: 0 })).toBe(0.85);
    expect(targetSuccess({ status: "learning", attempts: 5, missesInARow: 2 })).toBe(0.85);
    expect(targetSuccess({ status: "strong", attempts: 5, missesInARow: 0 })).toBe(0.62);
  });

  it("refits a bucket from first attempts and keeps a thin bucket near its label", () => {
    // 400 first attempts by average students, 27% right: items about 1 logit harder than them.
    const many = Array.from({ length: 400 }, (_, i) => ({ rating: 0, correct: i < 108, guessFloor: 0 }));
    const fitted = fitBucketDifficulty(many, 0);
    expect(fitted).toBeGreaterThan(0.9);
    expect(fitted).toBeLessThan(1.05);
    expect(fitBucketDifficulty([{ rating: 0, correct: true, guessFloor: 0 }], 1)).toBeGreaterThan(0.7);
  });
});

describe("FSRS (§9)", () => {
  it("replays a history deterministically and forgets on FSRS-6's curve", () => {
    const history = [
      { at: "2026-10-01T09:00:00Z", rating: "good" as const },
      { at: "2026-10-03T09:00:00Z", rating: "good" as const },
      { at: "2026-10-14T09:00:00Z", rating: "good" as const },
    ];
    const a = replay(history, "concept")!;
    const b = replay(history, "concept")!;
    expect(a).toEqual(b);
    expect(a.state).toBe(FsrsState.Review);
    expect(recallAt(a, new Date("2026-10-14T09:00:00Z"))).toBeCloseTo(1, 2);
    const later = recallAt(a, new Date(new Date("2026-10-14T09:00:00Z").getTime() + 30 * 86_400_000))!;
    expect(later).toBeLessThan(0.95);
    expect(later).toBeGreaterThan(0.5);
  });

  it("previews later due dates for better ratings and shows Leitner boxes from stability", () => {
    const now = new Date("2026-10-20T08:00:00Z");
    const card = review(null, "good", new Date("2026-10-10T08:00:00Z"));
    const due = preview(card, now);
    expect(due.again.getTime()).toBeLessThan(due.hard.getTime());
    expect(due.hard.getTime()).toBeLessThanOrEqual(due.good.getTime());
    expect(due.good.getTime()).toBeLessThan(due.easy.getTime());
    expect(leitnerBox(null)).toBe(1);
    expect(leitnerBox({ ...card, stability: 0.5, state: FsrsState.Review })).toBe(1);
    expect(leitnerBox({ ...card, stability: 5, state: FsrsState.Review })).toBe(3);
    expect(leitnerBox({ ...card, stability: 40, state: FsrsState.Review })).toBe(5);
    expect(describeWait(new Date(now.getTime() + 60_000), now)).toBe("1 min");
    expect(describeWait(new Date(now.getTime() + 3 * 86_400_000), now)).toBe("3 days");
  });
});

describe("weakness (§6)", () => {
  it("matches the doc's examples and needs evidence", () => {
    expect(weaknessScore({ firstAttempts: 10, pLearned: 0.2, confidentShare: 0, repeated: 0 })).toBeCloseTo(0.37, 2);
    expect(weaknessScore({ firstAttempts: 3, pLearned: 0.3, confidentShare: 0, repeated: 0 })).toBeCloseTo(0.21, 2);
    expect(isWeak(0.37)).toBe(true);
    expect(isWeak(0.21)).toBe(false);
    expect(weaknessScore({ firstAttempts: 0, pLearned: 0, confidentShare: 1, repeated: 1 })).toBe(0);
    expect(repeatedMisses(3, 1)).toBe(1);
    expect(repeatedMisses(3, 0)).toBe(0);
  });
});

describe("priority (§10)", () => {
  it("reproduces the worked example's ranking", () => {
    const exam = { inScope: true, anyExam: true, daysToExam: 3, answersToday: 0 };
    const ranked = rankByPriority([
      { name: "Sorting", priorityInput: { ...exam, weakness: 0.04, recall: 0.95, practiced: true } },
      { name: "Linked lists", priorityInput: { ...exam, weakness: 0.07, recall: 0.78, practiced: true } },
      { name: "Arrays", priorityInput: { ...exam, weakness: 0.41, recall: 0.95, practiced: true } },
      { name: "Recursion", priorityInput: { ...exam, weakness: 0.51, recall: 0.95, practiced: true } },
      { name: "Stacks", priorityInput: { ...exam, weakness: 0, recall: null, practiced: false } },
    ]);
    expect(ranked.map((item) => item.name)).toEqual(["Stacks", "Recursion", "Arrays", "Linked lists", "Sorting"]);
    expect(ranked.map((item) => Math.round(item.priority * 100) / 100)).toEqual([0.58, 0.53, 0.42, 0.35, 0.04]);
  });

  it("weighs exam distance, scope, forgetting and today's work", () => {
    expect(urgency(0)).toBeCloseTo(3, 2);
    expect(urgency(7)).toBeCloseTo(1.74, 2);
    expect(urgency(null)).toBe(1);
    expect(dueness(0.9)).toBe(0);
    expect(dueness(0.6)).toBe(1);
    const base = { inScope: false, anyExam: true, daysToExam: null, weakness: 0.5, recall: 0.9, practiced: true, answersToday: 0 };
    expect(priorityScore(base)).toBeCloseTo(0.6 * 0.225, 3);
    expect(priorityScore({ ...base, answersToday: 10 })).toBeCloseTo(0.6 * 0.225 * 0.5, 3);
    expect([conceptsPerPlan(10), conceptsPerPlan(20), conceptsPerPlan(45)]).toEqual([2, 3, 4]);
  });
});

describe("method rules (§11)", () => {
  const inPlan = new Set<StudyMethodId>(BUILDER_METHOD_IDS.filter((id) => !PLAN_METHODS.has(id)));

  it("gives a Not Started concept three days before an exam Chunking inside Tamari's plan", () => {
    const pick = chooseMethod({ state: "new", category: "understanding", openMisconception: false, daysToExam: 3, minutes: 20, allowed: inPlan });
    expect(pick.method).toBe("chunking");
    expect(pick.reason).toMatch(/exam is close/);
  });

  it("fixes a misconception first, and keeps short sessions short", () => {
    expect(chooseMethod({ state: "learning", category: "understanding", openMisconception: true, daysToExam: null, minutes: 20 }).method).toBe("error_review");
    expect(chooseMethod({ state: "learning", category: "understanding", openMisconception: true, daysToExam: null, minutes: 10, excluded: ["error_review"] }).method).not.toBe("feynman");
    expect(chooseMethod({ state: "weak", category: "calculation", openMisconception: false, daysToExam: null, minutes: 30 }).method).toBe("worked_examples");
    expect(chooseMethod({ state: "learning", category: "memorization", openMisconception: false, daysToExam: null, minutes: 20 }).method).toBe("flashcards");
    expect(chooseMethod({ state: "strong", category: "application", openMisconception: false, daysToExam: 2, minutes: 40 }).method).toBe("practice_testing");
    expect(chooseMethod({ state: "new", category: "memorization", openMisconception: false, daysToExam: null, minutes: 25, orderedListItems: 9 }).method).toBe("memory_palace");
  });
});

describe("concept model (§5–§8)", () => {
  it("masters a concept answered right three times across days, on hard-enough items", () => {
    const events = [answer("2026-10-10T02:00:00Z", true), answer("2026-10-11T02:00:00Z", true), answer("2026-10-12T02:00:00Z", true)];
    const model = modelConcept({ events, openMistakes: 0, category: "understanding", ability: 0, timeZone: TZ, now: new Date("2026-10-12T03:00:00Z") });
    expect(model.pLearned).toBeCloseTo(0.96, 2);
    expect(model.gates).toEqual({ evidence: true, hardItem: true, noMisconception: true, spaced: true });
    expect(model.recall).toBeCloseTo(1, 1);
    expect(model.mastery).toBeGreaterThanOrEqual(90);
    expect(model.status).toBe("mastered");
    expect(model.nextStep).toBeNull();
    expect(model.nextReviewAt).not.toBeNull();
  });

  it("caps mastery until the evidence is there", () => {
    const sameDay = [answer("2026-10-12T01:00:00Z", true), answer("2026-10-12T01:10:00Z", true), answer("2026-10-12T01:20:00Z", true)];
    const now = new Date("2026-10-12T02:00:00Z");
    const strong = modelConcept({ events: sameDay, openMistakes: 0, category: "understanding", ability: 0, timeZone: TZ, now });
    expect(strong.mastery).toBe(89);
    expect(strong.status).toBe("strong");
    expect(strong.nextStep).toBe("spaced");

    const two = modelConcept({ events: sameDay.slice(0, 2), openMistakes: 0, category: "understanding", ability: 0, timeZone: TZ, now });
    expect(two.mastery).toBeLessThanOrEqual(59);
    expect(two.nextStep).toBe("evidence");
    expect(two.status).toBe("learning");
  });

  it("keeps a confident error open until a correct answer on a later day", () => {
    const wrong = answer("2026-10-10T02:00:00Z", false, { confidence: "very_confident" });
    const open = modelConcept({ events: [answer("2026-10-09T02:00:00Z", true), wrong, answer("2026-10-10T03:00:00Z", true)], openMistakes: 1, category: "understanding", ability: 0, timeZone: TZ, now: new Date("2026-10-10T04:00:00Z") });
    expect(open.misconceptions).toBe(1);
    expect(open.gates.noMisconception).toBe(false);
    expect(open.mastery).toBeLessThanOrEqual(79);
    const cleared = modelConcept({ events: [answer("2026-10-09T02:00:00Z", true), wrong, answer("2026-10-11T03:00:00Z", true)], openMistakes: 0, category: "understanding", ability: 0, timeZone: TZ, now: new Date("2026-10-11T04:00:00Z") });
    expect(cleared.misconceptions).toBe(0);
  });

  it("marks a concept missed again and again as needing a foundation, and aims easy", () => {
    const events = [0, 1, 2, 3, 4].map((day) => answer(`2026-10-0${day + 1}T02:00:00Z`, day === 2, { confidence: "unsure" }));
    const model = modelConcept({ events, openMistakes: 4, category: "understanding", ability: 0, timeZone: TZ, now: new Date("2026-10-05T03:00:00Z") });
    expect(model.status).toBe("weak");
    expect(model.weakness).toBeGreaterThan(0.3);
    expect(model.nextDifficulty).toBe("easy");
  });

  it("lets recall fade without new answers, so a mastered concept needs a refresh", () => {
    const events = [answer("2026-08-01T02:00:00Z", true), answer("2026-08-03T02:00:00Z", true), answer("2026-08-06T02:00:00Z", true)];
    const fresh = modelConcept({ events, openMistakes: 0, category: "understanding", ability: 0, timeZone: TZ, now: new Date("2026-08-06T03:00:00Z") });
    const later = modelConcept({ events, openMistakes: 0, category: "understanding", ability: 0, timeZone: TZ, now: new Date("2026-10-06T03:00:00Z") });
    expect(later.recall!).toBeLessThan(fresh.recall!);
    expect(later.mastery).toBeLessThan(fresh.mastery);
    expect(later.pLearned).toBe(fresh.pLearned);
  });

  it("barely moves on rapid guesses and starts a new concept at the student's ability", () => {
    const rapid = [1, 2, 3, 4, 5, 6].map((i) => answer(`2026-10-0${i}T02:00:00Z`, true, { responseMs: 1_000 }));
    const model = modelConcept({ events: rapid, openMistakes: 0, category: "understanding", ability: 0.5, timeZone: TZ, now: new Date("2026-10-06T03:00:00Z"), medianMs: { multiple_choice: 20_000 } });
    expect(model.pLearned).toBeLessThan(0.8);
    const fresh = modelConcept({ events: [], openMistakes: 0, category: "understanding", ability: 0.5, timeZone: TZ, now: new Date("2026-10-06T03:00:00Z") });
    expect(fresh).toMatchObject({ status: "new", mastery: 0, rating: 0.5, recall: null, nextReviewAt: null });
  });
});
