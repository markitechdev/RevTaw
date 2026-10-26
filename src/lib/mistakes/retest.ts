import type { RecallComparison } from "@/lib/study/ai";
import { PASS_SCORE, verdictFor } from "@/lib/study/verdict";

/**
 * Retesting a mistake from the notebook (error review, rapid review, Tamari's Mistake Review). Pure and
 * client-safe: the session builders, the recall flow and the runner all use it.
 *
 * - A question answered by picking one option (multiple choice, two statements, true or false) is retested
 *   with its choices, and the pick is checked against the right one; "Which of these is NOT…?" can't be
 *   answered without them.
 * - Whatever else a question needs (a case's text, a scenario's situation and options) is shown with it.
 */

/** An option is a line, not a paragraph. */
const CHOICE_MAX = 500;
const CHOICES_MIN = 2;
const CHOICES_MAX = 8;

/** How choices are compared: case and spacing aside, and the same text in any Unicode form. */
export function choiceKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** 2–8 distinct, non-empty options as stored with a mistake; null when there aren't enough. */
export function cleanChoices(values: unknown): string[] | null {
  if (!Array.isArray(values)) return null;
  const seen = new Set<string>();
  const choices: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim().slice(0, CHOICE_MAX);
    const key = choiceKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    choices.push(text);
  }
  return choices.length >= CHOICES_MIN && choices.length <= CHOICES_MAX ? choices : null;
}

/** True and False: shown side by side, and not worth listing as options. */
export function isTrueFalse(choices: ReadonlyArray<string> | null): boolean {
  return choices?.length === 2 && choiceKey(choices[0]) === "true" && choiceKey(choices[1]) === "false";
}

/** What a retest item shows besides its question; kept in the item's analysis under `retest`. */
export type RetestView = {
  /** Set when the retest is answered by picking one of these (the right answer is one of them). */
  choices: string[] | null;
  /** Shown above the question: a case's text, a scenario's situation, options to reason about. */
  context: string | null;
};

const CONTEXT_MAX = 4000;

/**
 * The retest of a notebook entry: its choices when the right answer is one of them; otherwise the choices,
 * if any, become part of the context, so the question can still be answered in words.
 */
export function retestViewFor(mistake: { choices: unknown; context: string | null; correct_answer: string }): RetestView {
  const choices = cleanChoices(mistake.choices);
  const context = mistake.context?.trim() ? mistake.context.trim().slice(0, CONTEXT_MAX) : null;
  if (choices && choices.some((choice) => choiceKey(choice) === choiceKey(mistake.correct_answer))) return { choices, context };
  if (!choices) return { choices: null, context };
  const listed = `Options:\n${choices.map((choice) => `- ${choice}`).join("\n")}`;
  return { choices: null, context: (context ? `${context}\n\n${listed}` : listed).slice(0, CONTEXT_MAX) };
}

export function retestViewOf(analysis: unknown): RetestView {
  const empty: RetestView = { choices: null, context: null };
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) return empty;
  const value = (analysis as { retest?: unknown }).retest;
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const stored = value as { choices?: unknown; context?: unknown };
  return { choices: cleanChoices(stored.choices), context: typeof stored.context === "string" && stored.context.trim() ? stored.context : null };
}

/** A pick among a retest's choices, checked without AI: right only when it is the right choice. */
export function choiceComparison(picked: string, correct: string): RecallComparison {
  const right = Boolean(picked.trim()) && choiceKey(picked) === choiceKey(correct);
  const score = right ? 100 : 0;
  return {
    score,
    correct_points: right ? [correct] : [],
    missing_points: right ? [] : [correct],
    incorrect_points: right || !picked.trim() ? [] : [picked.trim()],
    feedback: right ? "That's the right choice." : picked.trim() ? `Not this one: the answer is “${correct}”.` : `The answer is “${correct}”.`,
    verdict: verdictFor(score, PASS_SCORE.recall),
  };
}
