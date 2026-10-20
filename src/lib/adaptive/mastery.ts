import type { ConfidenceLevel, MasteryStatus, NextDifficulty, QuestionDifficulty } from "@/lib/supabase/database.types";

/**
 * Mastery model (spec §16 Mastery Learning, §28 Adaptive Engine). Pure and
 * deterministic so it can be unit-tested and recomputed from evidence at
 * any time: the `concept_mastery` table is only a cache of its output.
 *
 * Inputs are the student's events on one concept: quiz answers, recall and
 * Feynman items, flashcard reviews. Each carries correctness and, when
 * known, difficulty, confidence and response time.
 */

export type EvidenceKind = "quiz" | "recall" | "feynman" | "flashcard" | "mistake";

export type EvidenceEvent = {
  at: string;
  kind: EvidenceKind;
  correct: boolean;
  difficulty?: QuestionDifficulty | null;
  confidence?: ConfidenceLevel | null;
  responseMs?: number | null;
};

export type MasteryInput = {
  events: EvidenceEvent[];
  openMistakes: number;
  now?: Date;
};

export type MasteryResult = {
  mastery: number;
  retrievalStrength: number;
  status: MasteryStatus;
  nextDifficulty: NextDifficulty;
  attempts: number;
  correct: number;
  incorrect: number;
  streak: number;
  misconceptions: number;
  underconfident: number;
  avgConfidence: number | null;
  avgResponseMs: number | null;
  trend: number;
  lastPracticedAt: string | null;
  nextReviewAt: string | null;
};

export const MASTERY_THRESHOLD = 80;

const CONFIDENCE_VALUE: Record<ConfidenceLevel, number> = { guessing: 1, unsure: 2, somewhat_confident: 3, very_confident: 4 };
const DIFFICULTY_WEIGHT: Record<QuestionDifficulty, number> = { easy: 0.9, medium: 1, hard: 1.2 };
const HALF_LIFE_DAYS = 14;
const EVIDENCE_FOR_FULL_CREDIT = 6;

export const STATUS_LABEL: Record<MasteryStatus, string> = {
  new: "Not started",
  weak: "Weak",
  learning: "Learning",
  strong: "Strong",
  mastered: "Mastered",
};

export const DIFFICULTY_LABEL: Record<NextDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  advanced: "Advanced",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function statusFor(mastery: number, attempts: number): MasteryStatus {
  if (attempts === 0) return "new";
  if (mastery >= MASTERY_THRESHOLD) return "mastered";
  if (mastery >= 60) return "strong";
  if (mastery >= 40) return "learning";
  return "weak";
}

/** Progressive difficulty (spec): Easy → Medium → Hard → Advanced as mastery grows. */
export function difficultyFor(mastery: number, attempts: number): NextDifficulty {
  if (attempts === 0 || mastery < 40) return "easy";
  if (mastery < 65) return "medium";
  if (mastery < MASTERY_THRESHOLD) return "hard";
  return "advanced";
}

/** Maps the next difficulty to a question difficulty the generators understand. */
export function questionDifficultyFor(next: NextDifficulty): QuestionDifficulty {
  return next === "easy" ? "easy" : next === "medium" ? "medium" : "hard";
}

/**
 * Weighted accuracy: recent events count more (per-event decay by order and
 * by age), hard questions count more, easy ones slightly less.
 */
function weightedAccuracy(events: EvidenceEvent[], now: Date): number {
  let weightSum = 0;
  let scoreSum = 0;
  const count = events.length;
  events.forEach((event, index) => {
    const ageDays = Math.max(0, (now.getTime() - new Date(event.at).getTime()) / 86_400_000);
    const ageWeight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const orderWeight = Math.pow(0.85, count - 1 - index);
    const weight = Math.max(0.05, ageWeight * orderWeight);
    const difficulty = event.difficulty ? DIFFICULTY_WEIGHT[event.difficulty] : 1;
    weightSum += weight;
    scoreSum += weight * (event.correct ? difficulty : 0);
  });
  return weightSum === 0 ? 0 : clamp(scoreSum / weightSum, 0, 1);
}

export function computeMastery(input: MasteryInput): MasteryResult {
  const now = input.now ?? new Date();
  const events = [...input.events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const attempts = events.length;
  const correct = events.filter((event) => event.correct).length;
  const incorrect = attempts - correct;

  let streak = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (!events[index].correct) break;
    streak += 1;
  }

  const withConfidence = events.filter((event) => event.confidence);
  const misconceptions = withConfidence.filter((event) => !event.correct && CONFIDENCE_VALUE[event.confidence!] >= 3).length;
  const underconfident = withConfidence.filter((event) => event.correct && CONFIDENCE_VALUE[event.confidence!] <= 2).length;
  const avgConfidence = withConfidence.length ? round2(withConfidence.reduce((sum, event) => sum + CONFIDENCE_VALUE[event.confidence!], 0) / withConfidence.length) : null;
  const withTime = events.filter((event) => typeof event.responseMs === "number" && event.responseMs! > 0);
  const avgResponseMs = withTime.length ? Math.round(withTime.reduce((sum, event) => sum + event.responseMs!, 0) / withTime.length) : null;

  // Accuracy, scaled by how much evidence exists, minus unresolved mistakes and misconceptions.
  const accuracy = weightedAccuracy(events, now);
  const evidenceFactor = Math.min(1, attempts / EVIDENCE_FOR_FULL_CREDIT);
  const base = accuracy * 100 * (0.6 + 0.4 * evidenceFactor);
  const penalty = Math.min(20, input.openMistakes * 5) + Math.min(15, misconceptions * 5);
  const mastery = attempts === 0 ? 0 : round2(clamp(base - penalty, 0, 100));

  // Trend: accuracy of the last three events vs. the three before them.
  const recent = events.slice(-3);
  const earlier = events.slice(-6, -3);
  const rate = (list: EvidenceEvent[]) => (list.length ? list.filter((event) => event.correct).length / list.length : null);
  const recentRate = rate(recent);
  const earlierRate = rate(earlier);
  const trend = recentRate !== null && earlierRate !== null ? round2((recentRate - earlierRate) * 100) : 0;

  // Retrieval strength follows a forgetting curve whose stability grows with consecutive correct answers.
  const last = events[events.length - 1] ?? null;
  const lastPracticedAt = last ? last.at : null;
  const stabilityDays = 2 + 3 * streak;
  const daysSince = last ? Math.max(0, (now.getTime() - new Date(last.at).getTime()) / 86_400_000) : 0;
  const retrievalStrength = last ? round2(clamp((mastery / 100) * 100 * Math.exp(-daysSince / stabilityDays), 0, 100)) : 0;
  const nextReviewAt = last
    ? new Date(new Date(last.at).getTime() + (last.correct ? stabilityDays : 1) * 86_400_000).toISOString()
    : null;

  return {
    mastery,
    retrievalStrength,
    status: statusFor(mastery, attempts),
    nextDifficulty: difficultyFor(mastery, attempts),
    attempts,
    correct,
    incorrect,
    streak,
    misconceptions,
    underconfident,
    avgConfidence,
    avgResponseMs,
    trend,
    lastPracticedAt,
    nextReviewAt,
  };
}
