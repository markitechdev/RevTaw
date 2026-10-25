/**
 * An unfinished session as Study's "Continue where you left off" and Home show it, built on the server
 * (queries.ts) and shared with the browser: what the row and its rename, end and delete need, nothing more.
 */

/** What ending or deleting a session touches besides its own answers, by method family. */
export type UnfinishedKind =
  /** Smart Study, a routine or pre-testing: a plan whose blocks are sessions of their own. */
  | "plan"
  /** A conversation with Tamari (Socratic, elaborative, self-explanation, teach-back). */
  | "tutor"
  /** A practice test, mixed practice or exam simulation, run as a quiz attempt. */
  | "test"
  /** A flashcard review. */
  | "review"
  /** A Pomodoro timer. */
  | "timer"
  /** Recall, Feynman, error review and the other methods answered item by item. */
  | "items";

export type UnfinishedSessionView = {
  id: string;
  title: string;
  kind: UnfinishedKind;
  /** Where it continues. */
  href: string;
  /** Answers given so far (cards rated, for a review). */
  answered: number;
  /** "Active Recall · started 2 days ago · 4 answered", written on the server so the page and the browser agree. */
  meta: string;
};
