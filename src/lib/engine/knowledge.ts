import { ENGINE } from "@/lib/engine/config";
import type { QuestionDifficulty } from "@/lib/supabase/database.types";

/**
 * How much of a concept the student knows (research doc §7, revised): the
 * share of its questions they would answer from knowledge rather than luck.
 *
 * Every answer is read with Bayesian Knowledge Tracing's guess and slip (a
 * known item is right with probability 1 − S, an unknown one with
 * probability G), but a concept is not treated as one fact that is either
 * learned or not: RevTaw's concepts span many facts, and students know part
 * of one. So P(right) = G + K·(1 − S − G), and K is fitted to the answers by
 * weighted least squares from a light prior. (With BKT's two states, a
 * student right 61% of the time on four-option multiple choice drifted to
 * "learned", 100%, and stayed there; here they sit near 0.5.)
 *
 * Answers count by how much they can tell (a typed answer more than a
 * true/false one), by how they were read (rapid guesses and unsure
 * successes less) and by recency (each newer answer scales the older ones
 * by `recency`), so improvement shows. Pure and client-safe.
 */

export type AnswerParams = { guess: number; slip: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** A scenario drill: the student picks an action from 3–5 options and justifies it. */
export const SCENARIO_CHOICE = "scenario_choice";

/** Formats where the student picks from options, so a lucky guess can be right. */
const OPTION_TYPES: ReadonlySet<string> = new Set(["multiple_choice", "true_false", "two_statement", "link", SCENARIO_CHOICE]);

export function isOptionType(questionType: string | null | undefined): boolean {
  return Boolean(questionType && OPTION_TYPES.has(questionType));
}

/**
 * G: 1/k for k-option multiple choice and scenario choices, 1/4 for two statements (four fixed choices),
 * 0.5 for true/false, 1/4 for a relationship picked from the map's list, small for typed and open answers.
 */
export function guessFor(questionType: string | null | undefined, optionCount: number | null | undefined): number {
  const { knowledge } = ENGINE;
  if (questionType === "true_false") return knowledge.guessTrueFalse;
  if (questionType === "two_statement") return 1 / 4;
  if (questionType === "link") return knowledge.guessRelation;
  if (questionType === "multiple_choice" || questionType === SCENARIO_CHOICE) {
    const k = optionCount && optionCount >= 2 ? optionCount : knowledge.defaultOptionCount;
    return 1 / k;
  }
  return knowledge.guessTyped;
}

/** The guessing floor for Elo: G when the student picks among options, otherwise 0. */
export function guessFloor(questionType: string | null | undefined, optionCount: number | null | undefined): number {
  return isOptionType(questionType) ? guessFor(questionType, optionCount) : 0;
}

export function slipFor(difficulty: QuestionDifficulty | null | undefined): number {
  return ENGINE.knowledge.slip[difficulty ?? "medium"];
}

export function paramsFor(questionType: string | null | undefined, optionCount: number | null | undefined, difficulty: QuestionDifficulty | null | undefined): AnswerParams {
  return { guess: guessFor(questionType, optionCount), slip: slipFor(difficulty) };
}

/** 1 − S − G: how much more often a known item is answered right than an unknown one. */
function separation(params: AnswerParams): number {
  return Math.max(0.05, 1 - params.slip - params.guess);
}

/** A typed answer to a medium question: the unit the prior and every answer's weight are counted in. */
const TYPED_SEPARATION = 1 - ENGINE.knowledge.slip.medium - ENGINE.knowledge.guessTyped;

export type KnowledgeAnswer = { correct: boolean; params: AnswerParams; weight: number; /** When it was answered (ms). */ at: number };

const DAY_MS = 86_400_000;

/**
 * Fits K to the answers: Σ w·a·(c − G) / Σ w·a², where a = 1 − S − G, c is 1 for a right answer, and w is
 * the answer's weight × (a / a_typed)² (so a typed answer counts 1 and a true/false one about 0.2). The
 * prior adds `priorAnswers` typed answers at `prior`. Clamped to 0–1: answers at or below chance show
 * nothing known yet.
 */
function fit(answers: ReadonlyArray<KnowledgeAnswer>, prior: { share: number; answers: number }, fading: { recency: number; halfLifeDays: number | null }): number | null {
  let credit = prior.answers * prior.share;
  let information = prior.answers;
  let fade = 1;
  const latest = answers.length ? answers[answers.length - 1].at : 0;
  // Newest first, so each older answer has been scaled once per newer one.
  for (let index = answers.length - 1; index >= 0; index -= 1) {
    const { correct, params, weight, at } = answers[index];
    const a = separation(params);
    const age = fading.halfLifeDays ? Math.pow(0.5, Math.max(0, latest - at) / DAY_MS / fading.halfLifeDays) : 1;
    const scale = (fade * age * clamp01(weight)) / (TYPED_SEPARATION * TYPED_SEPARATION);
    credit += scale * a * ((correct ? 1 : 0) - params.guess);
    information += scale * a * a;
    fade *= fading.recency;
  }
  return information > 0 ? clamp01(credit / information) : null;
}

/**
 * K as of the latest answer, oldest answer first: the prior, then every answer, the recent ones counting
 * most. An answer counts less the longer before the latest one it was given (half-life `halfLifeDays`):
 * what was known then may have been forgotten since, and FSRS's recall covers the time after the latest.
 */
export function knownShare(answers: ReadonlyArray<KnowledgeAnswer>): number {
  const { prior, priorAnswers, recency, halfLifeDays } = ENGINE.knowledge;
  return fit(answers, { share: prior, answers: priorAnswers }, { recency, halfLifeDays }) ?? prior;
}

/** The share a set of answers shows on its own (no prior, no fading), as for one day's practice; null without any. */
export function shareOf(answers: ReadonlyArray<KnowledgeAnswer>): number | null {
  return fit(answers, { share: 0, answers: 0 }, { recency: 1, halfLifeDays: null });
}

/** Predicted chance of a right answer: G + K·R·(1 − S − G) (for calibration checks). */
export function predictedCorrect(known: number, recall: number, params: AnswerParams): number {
  const k = clamp01(known) * clamp01(recall);
  return k * (1 - params.slip) + (1 - k) * params.guess;
}
