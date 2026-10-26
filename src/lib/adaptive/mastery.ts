import { ENGINE } from "@/lib/engine/config";
import { CONCEPT_STATES } from "@/lib/engine/types";
import type { ConceptMastery, MasteryStatus, NextDifficulty } from "@/lib/supabase/database.types";

/**
 * How mastery is shown. The numbers come from the learning engine
 * (src/lib/engine: the share known × FSRS recall, with evidence gates); this
 * module only names them. Client-safe.
 */

/** A concept counts as mastered from here (and only after every evidence gate is met). */
export const MASTERY_THRESHOLD: number = ENGINE.states.strongBelow;

/** Days between the first right answer and a later one before a concept can go past Strong. */
export const MASTERY_SPACING_DAYS: number = ENGINE.gates.spacedDays;

export const STATUS_LABEL: Record<MasteryStatus, string> = {
  new: "Not started",
  weak: "Needs foundation",
  learning: "Learning",
  developing: "Developing",
  strong: "Strong",
  mastered: "Mastered",
};

/** The state bands in words, for legends. */
export const STATUS_BANDS = `${STATUS_LABEL.weak} < ${ENGINE.states.foundationBelow} (after ${ENGINE.gates.minAnswers} answers) · ${STATUS_LABEL.learning} < ${ENGINE.states.learningBelow} · ${STATUS_LABEL.developing} ${ENGINE.states.learningBelow}–${ENGINE.states.developingBelow - 1} · ${STATUS_LABEL.strong} ${ENGINE.states.developingBelow}–${ENGINE.states.strongBelow - 1} · ${STATUS_LABEL.mastered} ≥ ${ENGINE.states.strongBelow}`;

export const DIFFICULTY_LABEL: Record<NextDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  advanced: "Advanced",
};

type NextStep = NonNullable<ConceptMastery["next_step"]>;

/** The evidence a concept still needs before its mastery can rise further. */
export const NEXT_STEP_LABEL: Record<NextStep, string> = {
  evidence: `Answer at least ${ENGINE.gates.minAnswers} questions on it`,
  noMisconception: "Fix the confident mistake, then get it right on another day",
  hardItem: "Get a hard question right, or one you answer without choices",
  spaced: `Get it right again ${MASTERY_SPACING_DAYS} or more days after the first time`,
};

const rank = (status: MasteryStatus) => CONCEPT_STATES.indexOf(status);

/**
 * A weak topic, wherever RevTaw names one (Home, Tamari, the planner, a material's page): a concept the
 * student holds a confident wrong idea about, or one practiced enough to tell (three answers) that needs a
 * foundation or is flagged by the weakness score. Not just a low number: a concept with one or two answers
 * is still being measured, and one that faded since it was learned needs a refresh, not a foundation.
 */
export function isWeakTopic(row: Pick<ConceptMastery, "attempts" | "first_attempts" | "status" | "weakness" | "misconceptions">): boolean {
  if (row.attempts <= 0) return false;
  if (row.misconceptions > 0) return true;
  if (row.status === "weak") return true;
  return row.first_attempts >= ENGINE.gates.minAnswers && Number(row.weakness) >= ENGINE.weakness.flagAt;
}

/** Was strong or mastered, and has dropped because recall faded: show it as a refresh, not a failure. */
export function needsRefresh(row: Pick<ConceptMastery, "status" | "best_status" | "recall">): boolean {
  if (!row.best_status || rank(row.best_status) < rank("strong") || rank(row.status) >= rank(row.best_status)) return false;
  return row.recall !== null && Number(row.recall) < ENGINE.fsrs.retention;
}
