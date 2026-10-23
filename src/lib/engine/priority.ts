import { ENGINE } from "@/lib/engine/config";

/**
 * What to study next (research doc §10): every concept gets one priority,
 *
 *   priority = relevance × urgency × need × freshness
 *   need     = 0.45 W + 0.30 D + 0.25 C
 *
 * Signals that gate each other multiply; alternative reasons to study add.
 * Forgetting enters only through D, never through W as well. Pure.
 */

export type PriorityInput = {
  /** In the scope of an upcoming exam. */
  inScope: boolean;
  /** Any exam is set (otherwise everything counts as in scope). */
  anyExam: boolean;
  /** Days until the nearest exam that covers the concept, if one does. */
  daysToExam: number | null;
  /** Weakness score W (0–1). */
  weakness: number;
  /** Today's recall probability, null when never practised. */
  recall: number | null;
  /** Has the student answered anything on it? */
  practiced: boolean;
  /** Answers on it today (about ten minutes' worth halves its freshness). */
  answersToday: number;
};

export type PriorityParts = { relevance: number; urgency: number; weakness: number; due: number; coverage: number; need: number; freshness: number };

export function relevance(input: Pick<PriorityInput, "inScope" | "anyExam">): number {
  return !input.anyExam || input.inScope ? 1 : ENGINE.priority.outOfScopeRelevance;
}

/** 1 + 2e^(−days/7): 3.0 on exam day, 2.3 at 3 days, 1.74 at a week, 1.03 at a month; 1 without an exam. */
export function urgency(daysToExam: number | null): number {
  if (daysToExam === null || daysToExam < 0) return 1;
  return 1 + ENGINE.priority.urgencyAmplitude * Math.exp(-daysToExam / ENGINE.priority.urgencyDays);
}

/** D: how far today's recall has fallen below 0.90 (0 at 0.90 or more, 1 at 0.60 or less). */
export function dueness(recall: number | null): number {
  if (recall === null) return 0;
  const { dueRecall, dueSpan } = ENGINE.priority;
  return Math.min(1, Math.max(0, (dueRecall - recall) / dueSpan));
}

export function priorityParts(input: PriorityInput): PriorityParts {
  const weights = ENGINE.priority.need;
  const weakness = Math.min(1, Math.max(0, input.weakness));
  const due = dueness(input.recall);
  // C: in scope but never practised.
  const coverage = !input.practiced && (input.inScope || !input.anyExam) ? 1 : 0;
  const need = weights.weakness * weakness + weights.due * due + weights.coverage * coverage;
  const freshness = input.answersToday >= ENGINE.priority.freshAnswers ? ENGINE.priority.freshness : 1;
  return { relevance: relevance(input), urgency: urgency(input.inScope ? input.daysToExam : null), weakness, due, coverage, need, freshness };
}

export function priorityScore(input: PriorityInput): number {
  const parts = priorityParts(input);
  return parts.relevance * parts.urgency * parts.need * parts.freshness;
}

export type Ranked<T> = T & { priority: number; parts: PriorityParts };

/** Highest priority first; ties go to the concept with the larger need, then by name for a stable order. */
export function rankByPriority<T extends { name: string; priorityInput: PriorityInput }>(items: T[]): Array<Ranked<T>> {
  return items
    .map((item) => ({ ...item, parts: priorityParts(item.priorityInput), priority: priorityScore(item.priorityInput) }))
    .sort((a, b) => b.priority - a.priority || b.parts.need - a.parts.need || a.name.localeCompare(b.name));
}

/** At most 2 concepts in 10 minutes, 3 in 20, 4 beyond: short sessions need focus. */
export function conceptsPerPlan(minutes: number): number {
  for (const band of ENGINE.priority.conceptsPerPlan) {
    if (minutes <= band.upTo) return band.concepts;
  }
  return 4;
}
