/**
 * Every tunable number of RevTaw's learning engine, in one place (research
 * doc "RevTaw Learning Intelligence Stack", §6–§11). Values a cited source
 * gives are noted; everything else is a heuristic starting value to be
 * tuned on real answers (calibration curves, next-day retests).
 */

export const ENGINE = {
  /** Mastery rows store this; a row from an older model is recomputed on its next read. 2: knowledge share in place of BKT. */
  modelVersion: 2,

  /** How much of a concept the student knows (§7, revised: guess- and slip-corrected answers, see knowledge.ts). */
  knowledge: {
    /** Where a concept starts: uploaded but not yet studied. */
    prior: 0.2,
    /** The start counts as this many typed answers: the first answer moves K a lot, not all the way. */
    priorAnswers: 1,
    /** Each newer answer scales the older ones by this much, so improvement shows. */
    recency: 0.97,
    /** An answer counts half as much this many days before the latest one (what was known then may have faded). */
    halfLifeDays: 14,
    /** G: 1/k for k-option multiple choice and scenario choices; true/false 0.5; typed or open answers 0.05. */
    guessTyped: 0.05,
    guessTrueFalse: 0.5,
    /** A relationship picked from the concept map's six wordings, two pairs of which mean the same. */
    guessRelation: 0.25,
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
    /** Until a right answer on a hard question, or one given without options to pick from (typed, explained, worked out, a justified scenario choice). */
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
    /** Student ability is the answers-weighted mean of concept ratings, shrunk to 0 as if by this many answers. */
    abilityPriorAnswers: 10,
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
  },

  /** Spaced repetition (§9). */
  fsrs: {
    /** Desired retention: Anki's default. */
    retention: 0.9,
    /** Leitner view: box 1 under 1 day of stability, 2 at 1–3, 3 at 3–7, 4 at 7–21, 5 beyond. */
    leitnerDays: [1, 3, 7, 21],
    /**
     * A concept's day of practice is one review, graded by the share of it the day's first tries show:
     * Again under 0.6, Hard under 0.85 (or when most right answers were unsure), otherwise Good.
     */
    dayGrade: { againBelow: 0.6, hardBelow: 0.85 },
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
