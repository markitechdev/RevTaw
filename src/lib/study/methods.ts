/**
 * Study method catalog (RevTaw spec §16). Phase 2 uses it to label
 * recommendations; later phases attach real session behaviour to each id.
 */
export type StudyMethodId =
  | "active_recall"
  | "spaced_repetition"
  | "flashcards"
  | "feynman"
  | "blurting"
  | "pomodoro"
  | "cornell_notes"
  | "retrieval_practice"
  | "practice_testing"
  | "interleaving"
  | "chunking"
  | "elaborative_interrogation"
  | "self_explanation"
  | "socratic_questioning"
  | "dual_coding"
  | "mind_mapping"
  | "mnemonics"
  | "worked_examples"
  | "faded_worked_examples"
  | "practice_problems"
  | "error_review"
  | "rapid_review"
  | "smart_study";

export type StudyMethod = {
  id: StudyMethodId;
  name: string;
  summary: string;
  bestFor: string;
};

export const STUDY_METHODS: ReadonlyArray<StudyMethod> = [
  { id: "active_recall", name: "Active Recall", summary: "Answer questions from memory before seeing the solution.", bestFor: "Definitions, facts, anything you must remember" },
  { id: "spaced_repetition", name: "Spaced Repetition", summary: "Review at growing intervals based on how well you remember.", bestFor: "Long-term retention before exams" },
  { id: "flashcards", name: "Flashcards", summary: "Term on the front, answer on the back, rated after each review.", bestFor: "Vocabulary, formulas, key facts" },
  { id: "feynman", name: "Feynman Technique", summary: "Explain a concept as if teaching a beginner, then fix the gaps.", bestFor: "Concepts you can recognise but not explain" },
  { id: "blurting", name: "Blurting", summary: "Write everything you remember, then compare with the source.", bestFor: "Checking what actually stuck after reading" },
  { id: "pomodoro", name: "Pomodoro", summary: "Focused intervals with short breaks.", bestFor: "Long study blocks and avoiding burnout" },
  { id: "cornell_notes", name: "Cornell Notes", summary: "Cues, notes and a summary in one structured page.", bestFor: "Lectures and dense reading" },
  { id: "retrieval_practice", name: "Retrieval Practice", summary: "Short recall exercises in many formats.", bestFor: "Strengthening memory of key points" },
  { id: "practice_testing", name: "Practice Testing", summary: "Timed or untimed tests without hints.", bestFor: "Exam readiness" },
  { id: "interleaving", name: "Interleaving", summary: "Mix related topics instead of drilling one at a time.", bestFor: "Wide syllabi and telling similar ideas apart" },
  { id: "chunking", name: "Chunking", summary: "Break large content into small sections with mini summaries.", bestFor: "Overwhelming chapters" },
  { id: "elaborative_interrogation", name: "Elaborative Interrogation", summary: "Keep asking why and how until the reason is clear.", bestFor: "Cause-and-effect topics" },
  { id: "self_explanation", name: "Self-Explanation", summary: "Explain why each step works as you solve.", bestFor: "Math, programming, engineering, science" },
  { id: "socratic_questioning", name: "Socratic Questioning", summary: "Guided questions instead of straight answers.", bestFor: "Deep understanding and assumptions" },
  { id: "dual_coding", name: "Dual Coding", summary: "Pair text with diagrams, tables and timelines.", bestFor: "Processes, relationships, sequences" },
  { id: "mind_mapping", name: "Mind Mapping", summary: "Hierarchical map of topics and links.", bestFor: "Seeing the big picture" },
  { id: "mnemonics", name: "Mnemonics", summary: "Acronyms, rhymes and stories for hard-to-remember lists.", bestFor: "Lists, sequences, names" },
  { id: "worked_examples", name: "Worked Examples", summary: "Step-by-step solutions with every step explained.", bestFor: "Learning new problem types" },
  { id: "faded_worked_examples", name: "Faded Worked Examples", summary: "Examples with progressively less help.", bestFor: "Moving from guided to independent solving" },
  { id: "practice_problems", name: "Practice Problems", summary: "Source-grounded problems with solutions.", bestFor: "Calculation-heavy subjects" },
  { id: "error_review", name: "Error Review", summary: "Revisit and retest past mistakes.", bestFor: "Breaking repeated errors" },
  { id: "rapid_review", name: "Rapid Review", summary: "Short sessions on the highest-value points.", bestFor: "Very little time before a test" },
  { id: "smart_study", name: "Smart Study", summary: "RevTaw picks the activities from your mastery, mistakes and due reviews.", bestFor: "When you do not want to choose a method" },
];

/** The spec's study methods (everything except the Smart Study planner), for analysis prompts. */
export const CORE_STUDY_METHODS = STUDY_METHODS.filter((method) => method.id !== "smart_study");

export const STUDY_METHOD_IDS = STUDY_METHODS.map((method) => method.id) as [StudyMethodId, ...StudyMethodId[]];

export const STUDY_METHOD_BY_ID: Record<StudyMethodId, StudyMethod> = Object.fromEntries(
  STUDY_METHODS.map((method) => [method.id, method]),
) as Record<StudyMethodId, StudyMethod>;
