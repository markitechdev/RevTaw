/**
 * Every tunable number of RevTaw's learning engine, in one place (research
 * doc "RevTaw Learning Intelligence Stack", §6–§11). Values a cited source
 * gives are noted; everything else is a heuristic starting value to be
 * tuned on real answers (calibration curves, next-day retests).
 */

export const ENGINE = {
  /** Bayesian Knowledge Tracing (§7). */
  bkt: {
    /** P(L0): uploaded but not yet studied. */
    prior: 0.2,
    /** T: half the 0.3 used in published examples, so mastery isn't declared too fast. */
    learn: 0.15,
    /** G: 1/k for k-option multiple choice; true/false 0.5; typed or open answers 0.05. */
    guessTyped: 0.05,
    guessTrueFalse: 0.5,
    defaultOptionCount: 4,
    /** S by difficulty: missing an easy item says more than missing a hard one. */
    slip: { easy: 0.05, medium: 0.1, hard: 0.2 },
  },

  /** How one answer is read (§6). */
  answers: {
    /** Under this share of the student's median time for the question type: a rapid guess. */
    rapidGuessShare: 0.3,
    /** Medians need this many timed answers of a type before rapid guesses are detected. */
    minTimedAnswers: 5,
    weight: { rapidGuess: 0.25, fragile: 0.5, full: 1 },
    /** Self-rated flashcards count half: the student grades them. */
    flashcardWeight: 0.5,
  },

  /** Gates that cap mastery until there is real evidence (§7). */
  gates: {
    minAnswers: 3,
    evidenceCap: 59,
    /** A correct answer on an item Elo predicted at this success or lower. */
    hardItemSuccess: 0.7,
    hardItemCap: 79,
    misconceptionCap: 79,
    /** A correct answer at least this many days after the first correct one. */
    spacedDays: 2,
    spacedCap: 89,
  },

  /** Mastery % → state (§7). */
  states: { foundationBelow: 40, learningBelow: 60, developingBelow: 80, strongBelow: 90 },

  /** Elo, run as an online Rasch model (§8; Pelánek 2016, Klinkenberg et al. 2011). */
  elo: {
    /** K(n) = max(floor, 1 / (1 + slope × n)). */
    kFloor: 0.2,
    kSlope: 0.05,
    /** The generator's labels as weak priors, in logits. */
    labelPrior: { easy: -1, medium: 0, hard: 1 },
    /** Target success when picking the next difficulty. */
    target: { normal: 0.72, foundation: 0.85, stretch: 0.62 },
    /** A stretch beyond "hard" ("advanced") when even hard items are this likely to be right. */
    advancedMargin: 0.1,
  },

  /** Shared difficulty buckets (label × question type × concept category), refit nightly. */
  buckets: {
    /** The label prior counts as this many first attempts when a bucket is refit. */
    priorWeight: 10,
    /** First attempts from the last this many days. */
    windowDays: 180,
    /** Logit range a bucket may move to. */
    range: 4,
  },

  /** Weakness score (§6). */
  weakness: {
    /** n / (n + shrink): one miss can't mark a topic weak. */
    shrink: 3,
    weights: { gap: 0.6, confident: 0.25, repeated: 0.15 },
    flagAt: 0.3,
    windowDays: 30,
    repeatedAt: 3,
  },

  /** Spaced repetition (§9). */
  fsrs: {
    /** Desired retention: Anki's default. */
    retention: 0.9,
    /** Leitner view: box 1 under 1 day of stability, 2 at 1–3, 3 at 3–7, 4 at 7–21, 5 beyond. */
    leitnerDays: [1, 3, 7, 21],
  },

  /** Smart Study priority (§10). */
  priority: {
    outOfScopeRelevance: 0.6,
    urgencyAmplitude: 2,
    urgencyDays: 7,
    need: { weakness: 0.45, due: 0.3, coverage: 0.25 },
    /** D = (dueRecall − R) / dueSpan, clamped to 0–1. */
    dueRecall: 0.9,
    dueSpan: 0.3,
    freshness: 0.5,
    /** Studied this many answers today (about ten minutes): freshness drops. */
    freshAnswers: 6,
    /** Most concepts per plan: focus beats breadth in short sessions. */
    conceptsPerPlan: [
      { upTo: 10, concepts: 2 },
      { upTo: 20, concepts: 3 },
      { upTo: Number.POSITIVE_INFINITY, concepts: 4 },
    ],
  },

  /** Exam booster (§9; Cepeda et al. 2008). */
  booster: {
    recallBelow: 0.9,
    horizonDays: 14,
    daysBefore: 2,
    maxConcepts: 8,
  },
} as const;

export type EngineConfig = typeof ENGINE;
