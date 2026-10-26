import { describe, expect, it } from "vitest";

import { median, readAnswer } from "@/lib/engine/answers";
import { chooseDifficulty, fitBucketDifficulty, kFactor, successProbability, targetSuccess } from "@/lib/engine/elo";
import { describeWait, leitnerBox, preview, recallAt, replay, review, FsrsState } from "@/lib/engine/fsrs";
import { guessFloor, knownShare, paramsFor, predictedCorrect, SCENARIO_CHOICE, type KnowledgeAnswer } from "@/lib/engine/knowledge";
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

describe("knowledge share (§7, revised)", () => {
  const DAY = 86_400_000;
  const T0 = Date.parse("2026-10-01T02:00:00Z");
  /** One answer a minute from T0; `pattern` is the right/wrong sequence. */
  const answers = (pattern: boolean[], type = "multiple_choice", options: number | null = 4, weight = 1): KnowledgeAnswer[] =>
    pattern.map((correct, index) => ({ correct, params: paramsFor(type, options, "medium"), weight, at: T0 + index * 60_000 }));
  /** `right` of `total` answers right, spread evenly. */
  const alternating = (right: number, total: number) => Array.from({ length: total }, (_, index) => Math.floor(((index + 1) * right) / total) > Math.floor((index * right) / total));

  it("follows the share of right answers, corrected for guessing", () => {
    expect(alternating(5, 10).filter(Boolean)).toHaveLength(5);
    const mcqHalf = knownShare(answers(alternating(5, 10)));
    expect(mcqHalf).toBeGreaterThan(0.2);
    expect(mcqHalf).toBeLessThan(0.45);
    expect(knownShare(answers(alternating(9, 10)))).toBeGreaterThan(0.8);
    expect(knownShare(answers(alternating(4, 10), "identification", null))).toBeLessThan(0.45);
    // Six of ten on true/false is about what guessing gives.
    expect(knownShare(answers(alternating(6, 10), "true_false", 2))).toBeLessThan(0.35);
    expect(knownShare(answers(alternating(10, 10)))).toBeLessThanOrEqual(1);
    expect(knownShare(answers(alternating(3, 10), "true_false", 2))).toBe(0);
    // No answers: the prior.
    expect(knownShare([])).toBe(0.2);
  });

  it("never locks: wrong answers after a long run of right ones bring it down", () => {
    const history = answers([...Array(25).fill(true), ...Array(15).fill(false)], "identification", null);
    expect(knownShare(history)).toBeLessThan(0.5);
  });

  it("counts recent answers most, and older ones less the longer before the latest they were", () => {
    expect(knownShare(answers([...Array(10).fill(false), ...Array(10).fill(true)]))).toBeGreaterThan(knownShare(answers([...Array(10).fill(true), ...Array(10).fill(false)])));
    const right = answers(Array(5).fill(true));
    const wrongNow: KnowledgeAnswer = { correct: false, params: paramsFor("multiple_choice", 4, "medium"), weight: 1, at: T0 + 10 * 60_000 };
    const wrongLater: KnowledgeAnswer = { ...wrongNow, at: T0 + 28 * DAY };
    expect(knownShare([...right, wrongLater])).toBeLessThan(knownShare([...right, wrongNow]));
  });

  it("learns more from a typed answer than from one picked among options", () => {
    const typed = knownShare(answers([true], "identification", null));
    const picked = knownShare(answers([true]));
    const trueFalse = knownShare(answers([true], "true_false", 2));
    expect(typed).toBeGreaterThan(picked);
    expect(picked).toBeGreaterThan(trueFalse);
    expect(trueFalse).toBeGreaterThan(0.2);
  });

  it("lets quarter-weight answers move it a little", () => {
    const full = knownShare(answers([true, true, true]));
    const quarter = knownShare(answers([true, true, true], "multiple_choice", 4, 0.25));
    expect(quarter).toBeGreaterThan(0.2);
    expect(quarter).toBeLessThan(full);
  });

  it("sets guess by question type and predicts correctness for calibration", () => {
    expect(guessFloor("multiple_choice", 4)).toBe(0.25);
    expect(guessFloor("true_false", 2)).toBe(0.5);
    // Four fixed choices, whatever the stored option count says.
    expect(guessFloor("two_statement", null)).toBe(0.25);
    expect(paramsFor("two_statement", 2, "medium").guess).toBe(0.25);
    // A scenario drill's choice and a relationship picked from the map's list can be guessed too.
    expect(guessFloor(SCENARIO_CHOICE, null)).toBe(0.25);
    expect(guessFloor("link", null)).toBe(0.25);
    expect(guessFloor("identification", null)).toBe(0);
    expect(paramsFor("recall", null, "medium").guess).toBe(0.05);
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
    expect(weaknessScore({ firstAttempts: 10, known: 0.2, confidentShare: 0, repeated: 0 })).toBeCloseTo(0.37, 2);
    expect(weaknessScore({ firstAttempts: 3, known: 0.3, confidentShare: 0, repeated: 0 })).toBeCloseTo(0.21, 2);
    expect(isWeak(0.37)).toBe(true);
    expect(isWeak(0.21)).toBe(false);
    expect(weaknessScore({ firstAttempts: 0, known: 0, confidentShare: 1, repeated: 1 })).toBe(0);
  });

  it("weighs misses by how often it went wrong lately, while one is still open", () => {
    expect(repeatedMisses(3, 3, 1)).toBe(1);
    expect(repeatedMisses(3, 20, 2)).toBeCloseTo(0.15, 5);
    expect(repeatedMisses(3, 3, 0)).toBe(0);
    expect(repeatedMisses(0, 0, 1)).toBe(0);
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
  const typed = { questionType: "identification", optionCount: null } as const;
  const run = (events: EngineEvent[], now: string, extra: { openMistakes?: number; ability?: number } = {}) =>
    modelConcept({ events, openMistakes: extra.openMistakes ?? 0, category: "understanding", ability: extra.ability ?? 0, timeZone: TZ, now: new Date(now) });

  it("masters a concept answered right on several days, one of them without options to pick from", () => {
    const events = [
      answer("2026-10-10T02:00:00Z", true),
      answer("2026-10-10T02:05:00Z", true),
      answer("2026-10-11T02:00:00Z", true, typed),
      answer("2026-10-12T02:00:00Z", true),
      answer("2026-10-12T02:05:00Z", true, typed),
    ];
    const model = run(events, "2026-10-12T03:00:00Z");
    expect(model.known).toBeGreaterThan(0.9);
    expect(model.gates).toEqual({ evidence: true, hardItem: true, noMisconception: true, spaced: true });
    expect(model.recall).toBeGreaterThan(0.99);
    expect(model.mastery).toBeGreaterThanOrEqual(90);
    expect(model.status).toBe("mastered");
    expect(model.nextStep).toBeNull();
    expect(model.nextReviewAt).not.toBeNull();
  });

  it("caps mastery until the evidence is there", () => {
    const sameDay = ["01:00", "01:10", "01:20", "01:30"].map((time) => answer(`2026-10-12T${time}:00Z`, true, typed));
    const now = "2026-10-12T02:00:00Z";
    const strong = run(sameDay, now);
    expect(100 * strong.known * strong.recall!).toBeGreaterThan(89);
    expect(strong.mastery).toBe(89);
    expect(strong.status).toBe("strong");
    expect(strong.nextStep).toBe("spaced");

    const two = run(sameDay.slice(0, 2), now);
    expect(two.mastery).toBeLessThanOrEqual(59);
    expect(two.nextStep).toBe("evidence");
    expect(two.status).toBe("learning");
  });

  it("keeps medium multiple choice below Strong until a hard or typed answer, at any rating", () => {
    const days = ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"];
    const picked = days.flatMap((day) => [answer(`${day}T02:00:00Z`, true), answer(`${day}T02:05:00Z`, true)]);
    for (const ability of [0, 1.5]) {
      const capped = run(picked, "2026-10-13T03:00:00Z", { ability });
      expect(capped.mastery).toBe(79);
      expect(capped.nextStep).toBe("hardItem");
    }
    const hard = run([...picked, answer("2026-10-13T02:10:00Z", true, { difficulty: "hard" })], "2026-10-13T03:00:00Z", { ability: 1.5 });
    expect(hard.gates.hardItem).toBe(true);
    expect(hard.mastery).toBeGreaterThan(79);
    // A hard question answered while guessing doesn't show it.
    const guessed = run([...picked, answer("2026-10-13T02:10:00Z", true, { difficulty: "hard", confidence: "guessing" })], "2026-10-13T03:00:00Z");
    expect(guessed.gates.hardItem).toBe(false);
  });

  it("stops flashcards alone at Developing and reads a Hard rating as effort, not doubt", () => {
    const cards = ["01", "02", "03", "04", "05", "06", "07", "08"].map((day, index): EngineEvent => ({
      at: `2026-10-${day}T02:00:00Z`,
      kind: "flashcard",
      itemKey: "c:card-1",
      correct: true,
      difficulty: "easy",
      questionType: "flashcard",
      optionCount: null,
      firstAttempt: false,
      confidence: null,
      responseMs: 8_000,
      rating: index % 2 === 0 ? "good" : "hard",
    }));
    const model = run(cards, "2026-10-08T03:00:00Z");
    expect(model.mastery).toBe(79);
    expect(model.nextStep).toBe("hardItem");
    expect(model.underconfident).toBe(0);
    expect(model.avgConfidence).toBeNull();
  });

  it("counts a question once a day, so a retake right after the answers adds nothing", () => {
    const first = Array.from({ length: 10 }, (_, i) => answer(`2026-10-10T02:${String(i).padStart(2, "0")}:00Z`, i % 2 === 0, { itemKey: `same${i}` }));
    const retake = Array.from({ length: 10 }, (_, i) => answer(`2026-10-10T03:${String(i).padStart(2, "0")}:00Z`, true, { itemKey: `same${i}`, firstAttempt: false }));
    const now = "2026-10-10T04:00:00Z";
    const before = run(first, now, { openMistakes: 5 });
    const after = run([...first, ...retake], now, { openMistakes: 0 });
    expect(after.known).toBe(before.known);
    expect(after.rating).toBe(before.rating);
    expect(after.mastery).toBe(before.mastery);
    // The same questions the next day are a real test again.
    const nextDay = retake.map((event) => ({ ...event, at: event.at.replace("2026-10-10", "2026-10-11") }));
    expect(run([...first, ...nextDay], "2026-10-11T04:00:00Z").known).toBeGreaterThan(before.known);
  });

  it("grades a day by how it went, so one slip in twenty is not forgetting", () => {
    const days = ["01", "02", "03", "04", "05"];
    const busy = days.flatMap((day) => Array.from({ length: 20 }, (_, i) => answer(`2026-10-${day}T02:${String(i).padStart(2, "0")}:00Z`, i !== 7, { ...typed, ...(i === 7 ? { confidence: "unsure" } : {}) })));
    const light = days.map((day) => answer(`2026-10-${day}T02:00:00Z`, true, typed));
    const nextDay = "2026-10-06T03:00:00Z";
    const a = run(busy, nextDay);
    const b = run(light, nextDay);
    expect(a.fsrs?.lapses).toBe(0);
    expect(a.fsrs?.stability).toBeCloseTo(b.fsrs!.stability, 5);
    expect(a.mastery).toBeGreaterThan(85);
    // A day mostly wrong is a lapse.
    const bad = [...light, ...Array.from({ length: 10 }, (_, i) => answer(`2026-10-06T02:${String(i).padStart(2, "0")}:00Z`, i < 2, typed))];
    expect(run(bad, "2026-10-06T03:00:00Z").fsrs?.lapses).toBe(1);
  });

  it("models a long history quickly (each day worked out once, misconceptions in one pass)", () => {
    const start = Date.parse("2026-01-01T02:00:00Z");
    const history = Array.from({ length: 2000 }, (_, index) =>
      answer(new Date(start + index * 3 * 3_600_000).toISOString(), index % 4 !== 0, index % 7 === 0 ? { confidence: "very_confident" } : {}),
    );
    const began = performance.now();
    const model = run(history, "2026-10-24T00:00:00Z", { openMistakes: 3 });
    expect(performance.now() - began).toBeLessThan(1500);
    expect(model.misconceptions).toBe(0);
    expect(model.gates.spaced).toBe(true);
  });

  it("keeps a confident error open until a correct answer on a later day", () => {
    const wrong = answer("2026-10-10T02:00:00Z", false, { confidence: "very_confident" });
    const open = run([answer("2026-10-09T02:00:00Z", true), wrong, answer("2026-10-10T03:00:00Z", true)], "2026-10-10T04:00:00Z", { openMistakes: 1 });
    expect(open.misconceptions).toBe(1);
    expect(open.gates.noMisconception).toBe(false);
    expect(open.mastery).toBeLessThanOrEqual(79);
    const cleared = run([answer("2026-10-09T02:00:00Z", true), wrong, answer("2026-10-11T03:00:00Z", true)], "2026-10-11T04:00:00Z");
    expect(cleared.misconceptions).toBe(0);
  });

  it("marks a concept missed again and again as needing a foundation, and aims easy", () => {
    const events = [0, 1, 2, 3, 4].map((day) => answer(`2026-10-0${day + 1}T02:00:00Z`, day === 2, { confidence: "unsure" }));
    const model = run(events, "2026-10-05T03:00:00Z", { openMistakes: 4 });
    expect(model.status).toBe("weak");
    expect(model.weakness).toBeGreaterThan(0.3);
    expect(model.nextDifficulty).toBe("easy");
    // No gate is what holds it down: the low K is.
    expect(model.nextStep).toBeNull();
  });

  it("lets recall fade without new answers, so a mastered concept needs a refresh", () => {
    const events = [answer("2026-08-01T02:00:00Z", true, typed), answer("2026-08-03T02:00:00Z", true), answer("2026-08-06T02:00:00Z", true, typed)];
    const fresh = run(events, "2026-08-06T03:00:00Z");
    const later = run(events, "2026-10-06T03:00:00Z");
    expect(later.recall!).toBeLessThan(fresh.recall!);
    expect(later.mastery).toBeLessThan(fresh.mastery);
    expect(later.known).toBe(fresh.known);
  });

  it("barely moves on rapid guesses and starts a new concept at the student's ability", () => {
    const rapid = [1, 2, 3, 4, 5, 6].map((i) => answer(`2026-10-0${i}T02:00:00Z`, true, { responseMs: 1_000 }));
    const model = modelConcept({ events: rapid, openMistakes: 0, category: "understanding", ability: 0.5, timeZone: TZ, now: new Date("2026-10-06T03:00:00Z"), medianMs: { multiple_choice: 20_000 } });
    expect(model.known).toBeLessThan(0.8);
    const fresh = modelConcept({ events: [], openMistakes: 0, category: "understanding", ability: 0.5, timeZone: TZ, now: new Date("2026-10-06T03:00:00Z") });
    expect(fresh).toMatchObject({ status: "new", mastery: 0, rating: 0.5, recall: null, nextReviewAt: null });
  });
});
