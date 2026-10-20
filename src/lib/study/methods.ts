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
  | "smart_study"
  | "teach_back"
  | "cumulative_review"
  | "mixed_practice"
  | "exam_simulation"
  | "question_generation"
  | "custom_routine"
  | "sq3r"
  | "pq4r"
  | "scenario_based"
  | "case_based"
  | "pre_testing"
  | "concept_mapping"
  | "memory_palace"
  | "story_method";

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
  { id: "teach_back", name: "Teach-Back", summary: "You teach; the AI learner asks whenever something is unclear.", bestFor: "Proving you can explain a topic end to end" },
  { id: "cumulative_review", name: "Cumulative Review", summary: "Mostly current material, with older lessons mixed back in.", bestFor: "Keeping earlier chapters alive" },
  { id: "mixed_practice", name: "Mixed Practice", summary: "Unpredictable question formats in one test.", bestFor: "Exams that mix formats" },
  { id: "exam_simulation", name: "Exam Simulation", summary: "Timed, shuffled, no hints, auto-submitted.", bestFor: "The final rehearsal" },
  { id: "question_generation", name: "Question Generation", summary: "Write your own exam questions; RevTaw rates and improves them.", bestFor: "Thinking like the examiner" },
  { id: "custom_routine", name: "Custom Routine", summary: "Your saved combination of methods, run as one session.", bestFor: "A routine you repeat before every exam" },
  { id: "sq3r", name: "SQ3R", summary: "Survey, question, read, recite, review — guided stage by stage.", bestFor: "Reading a chapter properly the first time" },
  { id: "pq4r", name: "PQ4R", summary: "Preview, question, read, reflect, recite, review.", bestFor: "Dense reading that needs reflection" },
  { id: "scenario_based", name: "Scenario-Based Learning", summary: "Realistic situations: choose an action and justify it.", bestFor: "Applied fields: nursing, business, CS, law" },
  { id: "case_based", name: "Case-Based Learning", summary: "Detailed cases: problem, evidence, options, best solution.", bestFor: "Analysis and judgement" },
  { id: "pre_testing", name: "Pre-Test → Study → Post-Test", summary: "A diagnostic first, then study, then measure the gain.", bestFor: "Seeing exactly what a study block changed" },
  { id: "concept_mapping", name: "Concept Mapping", summary: "Concepts linked by explicit relationships.", bestFor: "How ideas cause, require and contain each other" },
  { id: "memory_palace", name: "Memory Palace", summary: "Place concepts along a familiar route and walk it to recall.", bestFor: "Ordered lists and long sequences" },
  { id: "story_method", name: "Story Method", summary: "Related facts turned into one memorable, accurate story.", bestFor: "Facts that refuse to connect" },
];

/** The spec's study methods (everything except the planners/routines), for analysis prompts. */
export const CORE_STUDY_METHODS = STUDY_METHODS.filter((method) => method.id !== "smart_study" && method.id !== "custom_routine");

export const STUDY_METHOD_IDS = STUDY_METHODS.map((method) => method.id) as [StudyMethodId, ...StudyMethodId[]];

export const STUDY_METHOD_BY_ID: Record<StudyMethodId, StudyMethod> = Object.fromEntries(
  STUDY_METHODS.map((method) => [method.id, method]),
) as Record<StudyMethodId, StudyMethod>;
