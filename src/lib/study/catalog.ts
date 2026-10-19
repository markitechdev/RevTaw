import { STUDY_METHOD_BY_ID, STUDY_METHODS, type StudyMethodId } from "@/lib/study/methods";
import type { SessionGoal } from "@/lib/supabase/database.types";

/**
 * Session behaviour attached to each study method (spec §15): what a session
 * of this method actually does, which goals it fits, how long it should run
 * and whether it is implemented yet. Client-safe.
 */
export type MethodBehaviour = {
  howItHelps: string;
  bestUseCases: string;
  suggestedMinutes: number;
  /** Which builder goals this method is recommended for. */
  goals: SessionGoal[];
  requiresMaterial: boolean;
  /** Methods without a runner yet point at the phase that adds one. */
  availableIn: "now" | "Phase 5" | "Phase 8";
  /** What changes when this method runs (shown on the methods page). */
  behaviour: string;
};

export const METHOD_BEHAVIOUR: Record<StudyMethodId, MethodBehaviour> = {
  active_recall: {
    howItHelps: "Pulling an answer from memory strengthens it far more than re-reading it.",
    bestUseCases: "Definitions, facts, processes — anything you must remember on an exam.",
    suggestedMinutes: 15,
    goals: ["memorize", "practice", "quick_review", "master_topic"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "Answers stay hidden until you have written yours; RevTaw then compares the two and lists what you got right, what was missing and what was wrong. Missed items go to the mistake notebook.",
  },
  spaced_repetition: {
    howItHelps: "Reviewing just before you forget moves knowledge into long-term memory with the least effort.",
    bestUseCases: "Keeping many concepts alive across weeks before an exam.",
    suggestedMinutes: 10,
    goals: ["memorize", "quick_review", "exam_prep"],
    requiresMaterial: false,
    availableIn: "now",
    behaviour: "Only the flashcards that are due appear. Each rating reschedules the card: correct answers push it further out, misses bring it back tomorrow.",
  },
  flashcards: {
    howItHelps: "Short question-answer pairs make retrieval fast and repeatable.",
    bestUseCases: "Vocabulary, formulas, key facts, dates.",
    suggestedMinutes: 10,
    goals: ["memorize", "quick_review"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "Cards are generated from the material; you flip and rate each one, and the deck's Leitner boxes and review dates update as you go.",
  },
  feynman: {
    howItHelps: "Teaching a concept in plain words exposes the gaps that recognition hides.",
    bestUseCases: "Concepts you recognise but cannot explain; theory-heavy subjects.",
    suggestedMinutes: 20,
    goals: ["understand", "master_topic"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "You explain each concept as if to a beginner. RevTaw points out correct ideas, missing pieces, wrong ideas and unnecessary complexity, asks you to improve the explanation, and only then shows the ideal version.",
  },
  blurting: {
    howItHelps: "Writing everything you remember shows exactly what stuck after reading.",
    bestUseCases: "Checking retention right after a study block.",
    suggestedMinutes: 15,
    goals: ["memorize", "quick_review"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "Notes are hidden while you write; RevTaw compares your text with the source and lists what was remembered, missing and incorrect.",
  },
  pomodoro: {
    howItHelps: "Fixed focus intervals with breaks keep attention high across a long block.",
    bestUseCases: "Long study sessions, reading, problem sets.",
    suggestedMinutes: 30,
    goals: ["practice", "exam_prep", "master_topic"],
    requiresMaterial: false,
    availableIn: "now",
    behaviour: "A work/break timer with presets (15/5, 25/5, 45/10, 50/10, 60/15) and a long break after four rounds; completed rounds count toward your focus time and streak.",
  },
  cornell_notes: {
    howItHelps: "Cues, notes and a summary force you to process a lesson three times.",
    bestUseCases: "Lectures and dense reading.",
    suggestedMinutes: 20,
    goals: ["understand"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "Generate a Cornell reviewer from the material (Notes → Create reviewer → Cornell): cue column, main notes and summary, all editable.",
  },
  retrieval_practice: {
    howItHelps: "Varied recall formats build flexible memory instead of pattern matching.",
    bestUseCases: "Strengthening key points across a chapter.",
    suggestedMinutes: 15,
    goals: ["memorize", "practice"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "Mixed short recall exercises drawn from the material.",
  },
  practice_testing: {
    howItHelps: "Testing under exam conditions reveals what you can produce, not just recognise.",
    bestUseCases: "Exam readiness; finding weak concepts quickly.",
    suggestedMinutes: 30,
    goals: ["practice", "exam_prep", "master_topic"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "A mixed-type test is generated from the material; answers are hidden until you submit, with an optional timer. The score, concept breakdown and mistakes feed your progress.",
  },
  interleaving: {
    howItHelps: "Mixing topics forces you to pick the right method each time, like an exam does.",
    bestUseCases: "Wide syllabi and similar-looking concepts.",
    suggestedMinutes: 30,
    goals: ["exam_prep", "master_topic"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "Questions alternate between materials and topics instead of drilling one at a time.",
  },
  chunking: {
    howItHelps: "Small sections with mini summaries keep a big chapter from overwhelming you.",
    bestUseCases: "Long chapters and first readings.",
    suggestedMinutes: 25,
    goals: ["understand"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "The material is split into short sections, each with a summary and a check question before moving on.",
  },
  elaborative_interrogation: {
    howItHelps: "Asking why and how connects facts into explanations that last.",
    bestUseCases: "Cause-and-effect topics, science, history.",
    suggestedMinutes: 20,
    goals: ["understand"],
    requiresMaterial: true,
    availableIn: "Phase 5",
    behaviour: "The tutor keeps asking why and how about each claim until the reason is clear.",
  },
  self_explanation: {
    howItHelps: "Explaining each step while solving catches misunderstandings early.",
    bestUseCases: "Math, programming, engineering, science problems.",
    suggestedMinutes: 25,
    goals: ["understand", "practice"],
    requiresMaterial: true,
    availableIn: "Phase 5",
    behaviour: "You explain why each step of a solution works before moving on.",
  },
  socratic_questioning: {
    howItHelps: "Guided questions make you reach the answer instead of being handed it.",
    bestUseCases: "Deep understanding, assumptions, reasoning.",
    suggestedMinutes: 20,
    goals: ["understand", "master_topic"],
    requiresMaterial: true,
    availableIn: "Phase 5",
    behaviour: "The AI tutor answers with questions that lead you to the idea.",
  },
  dual_coding: {
    howItHelps: "Pairing words with a diagram gives memory two routes to the same idea.",
    bestUseCases: "Processes, relationships, sequences.",
    suggestedMinutes: 20,
    goals: ["understand", "memorize"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "Text is paired with generated diagrams, tables and timelines.",
  },
  mind_mapping: {
    howItHelps: "A map of topics and links shows the structure you are studying.",
    bestUseCases: "Seeing the big picture before details.",
    suggestedMinutes: 20,
    goals: ["understand"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "An editable hierarchical map generated from the material, with questions from any branch.",
  },
  mnemonics: {
    howItHelps: "Acronyms, rhymes and stories make arbitrary lists stick.",
    bestUseCases: "Lists, sequences, names.",
    suggestedMinutes: 10,
    goals: ["memorize"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "RevTaw proposes mnemonics for hard-to-remember lists in the material.",
  },
  worked_examples: {
    howItHelps: "Seeing every step explained builds the pattern before you solve alone.",
    bestUseCases: "New problem types.",
    suggestedMinutes: 25,
    goals: ["understand", "practice"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "Problem, step-by-step solution with reasons, final answer, then a similar problem for you.",
  },
  faded_worked_examples: {
    howItHelps: "Removing help gradually moves you from guided to independent solving.",
    bestUseCases: "After worked examples, before practice problems.",
    suggestedMinutes: 25,
    goals: ["practice"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "Examples completed 90%, 70%, 40% and then not at all.",
  },
  practice_problems: {
    howItHelps: "Repetition with feedback builds fluency in calculation-heavy subjects.",
    bestUseCases: "Math, physics, accounting, chemistry.",
    suggestedMinutes: 30,
    goals: ["practice", "master_topic"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "Source-grounded problems with difficulty levels and step-by-step solutions after you answer.",
  },
  error_review: {
    howItHelps: "Retesting past mistakes breaks the errors that keep repeating.",
    bestUseCases: "Before an exam, after a weak quiz.",
    suggestedMinutes: 10,
    goals: ["practice", "exam_prep", "master_topic"],
    requiresMaterial: false,
    availableIn: "now",
    behaviour: "Open entries from your mistake notebook come back as recall questions; a correct answer marks the mistake learned, a miss keeps it open.",
  },
  rapid_review: {
    howItHelps: "Hitting the highest-value points first makes the most of very little time.",
    bestUseCases: "The night before, between classes.",
    suggestedMinutes: 10,
    goals: ["quick_review", "exam_prep"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "A 5-15 minute pass over weak concepts, important facts and previous mistakes.",
  },
};

export const IMPLEMENTED_METHOD_IDS = STUDY_METHODS.filter((method) => METHOD_BEHAVIOUR[method.id].availableIn === "now").map((method) => method.id) as [
  StudyMethodId,
  ...StudyMethodId[],
];

/** Methods that run through the session builder (flashcards/spaced repetition start from the Flashcards section). */
export const BUILDER_METHOD_IDS = ["active_recall", "feynman", "practice_testing", "error_review", "pomodoro", "spaced_repetition", "flashcards"] as const;
export type BuilderMethodId = (typeof BUILDER_METHOD_IDS)[number];

export function isBuilderMethod(value: string): value is BuilderMethodId {
  return (BUILDER_METHOD_IDS as readonly string[]).includes(value);
}

export const TIME_PRESETS = [5, 15, 30, 45, 60] as const;

/** Builder recommendation: the implemented methods that fit a goal, best first. */
export function recommendMethods(goal: SessionGoal, hasMaterial: boolean): BuilderMethodId[] {
  const fits = BUILDER_METHOD_IDS.filter((id) => METHOD_BEHAVIOUR[id].goals.includes(goal) && (hasMaterial || !METHOD_BEHAVIOUR[id].requiresMaterial));
  return fits.length ? [...fits] : [...BUILDER_METHOD_IDS.filter((id) => hasMaterial || !METHOD_BEHAVIOUR[id].requiresMaterial)];
}

export function methodName(id: string): string {
  return (STUDY_METHOD_BY_ID as Record<string, { name: string } | undefined>)[id]?.name ?? id;
}
