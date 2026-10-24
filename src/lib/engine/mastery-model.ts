import { readAnswer, type ReadAnswer } from "@/lib/engine/answers";
import { bktUpdate, guessFloor, paramsFor } from "@/lib/engine/bkt";
import { ENGINE } from "@/lib/engine/config";
import { bucketKey, chooseDifficulty, eloStep, labelPrior, successProbability, targetSuccess } from "@/lib/engine/elo";
import { recallAt, replay, type FsrsSnapshot, type GradedReview } from "@/lib/engine/fsrs";
import type { ConceptState } from "@/lib/engine/types";
import { repeatedMisses, weaknessScore } from "@/lib/engine/weakness";
import type { ConceptCategory } from "@/lib/materials/analysis-schema";
import { dateIn, daysBetween } from "@/lib/planner/dates";
import type { ConfidenceLevel, FlashcardRating, NextDifficulty, QuestionDifficulty } from "@/lib/supabase/database.types";

/**
 * The concept model (research doc §5–§8): three estimators read the same
 * answers side by side.
 *
 *   BKT   has the student learned it?            → P(L)
 *   FSRS  can they still recall it today?        → R (one review per day)
 *   Elo   how able are they, how hard was it?    → rating, next difficulty
 *
 * Mastery = 100 × P(L) × R, capped by gates that need real evidence; the
 * state, weakness and open misconceptions come from the same pass. Pure and
 * deterministic: concept_mastery is only a cache of this function's output.
 */

export type EngineEventKind = "quiz" | "recall" | "feynman" | "mistake" | "item" | "flashcard";

export type EngineEvent = {
  at: string;
  kind: EngineEventKind;
  /** The question, session item or card answered (per-day reviews take each one's first answer that day). */
  itemKey: string;
  correct: boolean;
  difficulty: QuestionDifficulty | null;
  /** The quiz question's type, or the study item's kind. */
  questionType: string | null;
  optionCount: number | null;
  /** The student's first answer ever to this question (quiz retakes repeat questions). */
  firstAttempt: boolean;
  confidence: ConfidenceLevel | null;
  responseMs: number | null;
  rating?: FlashcardRating | null;
};

export type ConceptModelInput = {
  events: EngineEvent[];
  openMistakes: number;
  category: ConceptCategory;
  /** The student's overall ability: where a concept's rating starts. */
  ability: number;
  /** Learned bucket difficulties; a missing bucket uses its label's prior. */
  bucketDifficulty?: (key: string) => number | undefined;
  /** The student's median response time per question type (rapid guesses are read against it). */
  medianMs?: Record<string, number | null>;
  timeZone: string;
  now?: Date;
};

export type Gates = { evidence: boolean; hardItem: boolean; noMisconception: boolean; spaced: boolean };
export type GateKey = keyof Gates;

export type ConceptModel = {
  mastery: number;
  retrievalStrength: number;
  status: ConceptState;
  nextDifficulty: NextDifficulty;
  attempts: number;
  correct: number;
  incorrect: number;
  streak: number;
  /** Open misconceptions: confident wrong answers not yet cleared on a later day. */
  misconceptions: number;
  underconfident: number;
  avgConfidence: number | null;
  avgResponseMs: number | null;
  trend: number;
  lastPracticedAt: string | null;
  nextReviewAt: string | null;
  pLearned: number;
  recall: number | null;
  rating: number;
  ratingAnswers: number;
  weakness: number;
  firstAttempts: number;
  gates: Gates;
  /** The gate holding mastery down right now (Tamari's next step); null when none is the limit. */
  nextStep: GateKey | null;
  fsrs: FsrsSnapshot | null;
};

const CONFIDENCE_VALUE: Record<ConfidenceLevel, number> = { guessing: 1, unsure: 2, somewhat_confident: 3, very_confident: 4 };
const DAY_MS = 86_400_000;

const round2 = (value: number) => Math.round(value * 100) / 100;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** Gate order by how hard each one caps mastery: the first unmet one is the next step. */
const GATE_ORDER: Array<{ key: GateKey; cap: number }> = [
  { key: "evidence", cap: ENGINE.gates.evidenceCap },
  { key: "noMisconception", cap: ENGINE.gates.misconceptionCap },
  { key: "hardItem", cap: ENGINE.gates.hardItemCap },
  { key: "spaced", cap: ENGINE.gates.spacedCap },
];

export function stateFor(mastery: number, events: number, answered: number): ConceptState {
  const { foundationBelow, learningBelow, developingBelow, strongBelow } = ENGINE.states;
  if (events === 0) return "new";
  if (answered >= ENGINE.gates.minAnswers && mastery < foundationBelow) return "weak";
  if (mastery < learningBelow) return "learning";
  if (mastery < developingBelow) return "developing";
  if (mastery < strongBelow) return "strong";
  return "mastered";
}

function mostCommon<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * One review per day for the concept (§9): Again if any first try at an
 * item that day was wrong, Hard if all were right but some fragile,
 * otherwise Good. Rapid guesses don't count.
 */
export function dailyReviews(events: EngineEvent[], readings: ReadAnswer[], timeZone: string, eventDays?: string[]): GradedReview[] {
  const days = new Map<string, { at: string; seen: Set<string>; wrong: boolean; fragile: boolean; graded: number }>();
  events.forEach((event, index) => {
    const reading = readings[index];
    if (reading.reading === "rapid_guess") return;
    const day = eventDays?.[index] ?? dateIn(event.at, timeZone);
    const entry = days.get(day) ?? { at: event.at, seen: new Set<string>(), wrong: false, fragile: false, graded: 0 };
    days.set(day, entry);
    entry.at = event.at;
    if (entry.seen.has(event.itemKey)) return;
    entry.seen.add(event.itemKey);
    entry.graded += 1;
    if (!event.correct) entry.wrong = true;
    else if (reading.grade === "hard") entry.fragile = true;
  });
  return [...days.values()].filter((day) => day.graded > 0).map((day) => ({ at: day.at, rating: day.wrong ? "again" : day.fragile ? "hard" : "good" }));
}

export function modelConcept(input: ConceptModelInput): ConceptModel {
  const now = input.now ?? new Date();
  const events = [...input.events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const readings = events.map((event) =>
    readAnswer({ correct: event.correct, confidence: event.confidence, responseMs: event.responseMs, medianMs: input.medianMs?.[event.questionType ?? event.kind] ?? null }),
  );
  const weightOf = (index: number) => readings[index].weight * (events[index].kind === "flashcard" ? ENGINE.answers.flashcardWeight : 1);
  // Each event's day in the student's zone, worked out once.
  const days = events.map((event) => dateIn(event.at, input.timeZone));
  const real = (index: number) => readings[index].reading !== "rapid_guess";

  // BKT: every answer, weighted by how it was read.
  let pLearned: number = ENGINE.bkt.prior;
  events.forEach((event, index) => {
    pLearned = bktUpdate(pLearned, event.correct, paramsFor(event.questionType ?? event.kind, event.optionCount, event.difficulty), weightOf(index));
  });

  // Elo: quiz answers and session items (self-rated cards measure memory, not ability).
  let rating = input.ability;
  let ratingAnswers = 0;
  let hardItemCorrect = false;
  const bucket = (label: QuestionDifficulty, type: string) => input.bucketDifficulty?.(bucketKey(label, type, input.category)) ?? labelPrior(label);
  events.forEach((event, index) => {
    if (event.kind === "flashcard") return;
    const label = event.difficulty ?? "medium";
    const type = event.questionType ?? event.kind;
    const probability = successProbability(rating, bucket(label, type), guessFloor(type, event.optionCount));
    if (event.correct && real(index) && probability <= ENGINE.gates.hardItemSuccess) hardItemCorrect = true;
    rating = eloStep(rating, ratingAnswers, event.correct, probability, readings[index].weight);
    ratingAnswers += 1;
  });

  // Misconceptions stay open until a correct answer on a later day clears them: one pass finds the last such day.
  let lastCorrectDay = "";
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].correct && real(index) && days[index] > lastCorrectDay) lastCorrectDay = days[index];
  }
  const openMisconceptions = events.filter((_, index) => readings[index].reading === "misconception" && !(lastCorrectDay > days[index]));

  // Weakness: the gap in P(learned), confident errors and repeated misses, shrunk by evidence.
  const windowStart = now.getTime() - ENGINE.weakness.windowDays * DAY_MS;
  const recentMisses = events.filter((event, index) => !event.correct && real(index) && event.kind !== "flashcard" && new Date(event.at).getTime() >= windowStart);
  const confidentOpen = openMisconceptions.filter((event) => new Date(event.at).getTime() >= windowStart).length;
  const firstAttempts = events.filter((event) => event.firstAttempt && event.kind !== "flashcard").length;
  const weakness = weaknessScore({
    firstAttempts,
    pLearned,
    confidentShare: recentMisses.length > 0 ? confidentOpen / recentMisses.length : 0,
    repeated: repeatedMisses(recentMisses.length, input.openMistakes),
  });

  // FSRS on the concept: one review per day, replayed from the history.
  const fsrs = replay(dailyReviews(events, readings, input.timeZone, days), "concept");
  const recall = fsrs ? (recallAt(fsrs, now) ?? 1) : null;

  // Gates.
  const answered = events.filter((_, index) => real(index)).length;
  const correctDays = days.filter((_, index) => events[index].correct && real(index));
  const firstCorrectDay = correctDays[0] ?? null;
  const gates: Gates = {
    evidence: answered >= ENGINE.gates.minAnswers,
    hardItem: hardItemCorrect,
    noMisconception: openMisconceptions.length === 0,
    spaced: firstCorrectDay !== null && correctDays.some((day) => daysBetween(firstCorrectDay, day) >= ENGINE.gates.spacedDays),
  };
  const unmet = GATE_ORDER.filter((gate) => !gates[gate.key]);
  const cap = unmet.reduce((lowest, gate) => Math.min(lowest, gate.cap), 100);
  const raw = 100 * pLearned * (recall ?? 1);
  const mastery = events.length === 0 ? 0 : round2(Math.min(raw, cap));
  const status = stateFor(mastery, events.length, answered);

  // Counts the rest of RevTaw shows.
  const correct = events.filter((event) => event.correct).length;
  let streak = 0;
  for (let index = events.length - 1; index >= 0 && events[index].correct; index -= 1) streak += 1;
  let missesInARow = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].kind === "flashcard" || !real(index)) continue;
    if (events[index].correct) break;
    missesInARow += 1;
  }
  const withConfidence = events.filter((event) => event.confidence);
  const underconfident = withConfidence.filter((event) => event.correct && CONFIDENCE_VALUE[event.confidence!] <= 2).length;
  const avgConfidence = withConfidence.length ? round2(withConfidence.reduce((sum, event) => sum + CONFIDENCE_VALUE[event.confidence!], 0) / withConfidence.length) : null;
  const timed = events.filter((event) => typeof event.responseMs === "number" && event.responseMs > 0);
  const avgResponseMs = timed.length ? Math.round(timed.reduce((sum, event) => sum + event.responseMs!, 0) / timed.length) : null;
  const rate = (list: EngineEvent[]) => (list.length ? list.filter((event) => event.correct).length / list.length : null);
  const recentRate = rate(events.slice(-3));
  const earlierRate = rate(events.slice(-6, -3));
  const trend = recentRate !== null && earlierRate !== null ? round2((recentRate - earlierRate) * 100) : 0;

  // Next difficulty: the label whose predicted success is closest to the target for this state.
  const quizTypes = events.filter((event) => event.kind === "quiz" && event.questionType).map((event) => event.questionType as string);
  const type = mostCommon(quizTypes) ?? "multiple_choice";
  const optionCount = mostCommon(events.filter((event) => event.questionType === type && event.optionCount).map((event) => event.optionCount as number));
  const choice = chooseDifficulty(
    rating,
    (["easy", "medium", "hard"] as const).map((label) => ({ label, difficulty: bucket(label, type), guessFloor: guessFloor(type, optionCount) })),
    targetSuccess({ status, attempts: events.length, missesInARow }),
    status === "strong" || status === "mastered",
  );

  return {
    mastery,
    retrievalStrength: recall === null ? 0 : round2(recall * 100),
    status,
    nextDifficulty: choice.label,
    attempts: events.length,
    correct,
    incorrect: events.length - correct,
    streak,
    misconceptions: openMisconceptions.length,
    underconfident,
    avgConfidence,
    avgResponseMs,
    trend,
    lastPracticedAt: events.length ? events[events.length - 1].at : null,
    nextReviewAt: fsrs ? fsrs.due : null,
    pLearned: round4(pLearned),
    recall: recall === null ? null : round4(recall),
    rating: round4(rating),
    ratingAnswers,
    weakness: round4(weakness),
    firstAttempts,
    gates,
    // A gate is the next step only while it is what holds mastery down (a low P(learned) is its own problem).
    nextStep: unmet[0] && raw > cap ? unmet[0].key : null,
    fsrs,
  };
}
