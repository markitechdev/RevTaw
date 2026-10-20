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
  smart_study: {
    howItHelps: "The right mix of activities for today, chosen from what you keep getting wrong, what is fading and what is due.",
    bestUseCases: "Any day you have time to study but no plan.",
    suggestedMinutes: 30,
    goals: ["memorize", "understand", "practice", "exam_prep", "quick_review", "master_topic"],
    requiresMaterial: false,
    availableIn: "now",
    behaviour: "RevTaw builds a plan of blocks — a blurt to open longer sessions, error review, active recall on weak concepts, a Feynman block for misconceptions, due flashcards, a short practice test — sized to your time, each with the reason it was picked. You run the blocks one by one and get one combined summary.",
  },
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
    availableIn: "now",
    behaviour: "Each section of the material becomes a blurt: the notes stay hidden while you write everything you remember, then RevTaw compares your text with the source and lists what you remembered, what was missing, what was incorrect and which important concepts you forgot. You get one retry before the source is shown.",
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
    availableIn: "now",
    behaviour: "Recall exercises in rotating formats — short answer, definition, fill in the blank, explanation, list, example, process, calculation — each graded against the material; retrieval strength per concept updates as you go.",
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
    availableIn: "now",
    behaviour: "You pick two to four materials; recall prompts alternate between them so every question forces you to decide which idea applies, and each prompt shows which material it came from.",
  },
  chunking: {
    howItHelps: "Small sections with mini summaries keep a big chapter from overwhelming you.",
    bestUseCases: "Long chapters and first readings.",
    suggestedMinutes: 25,
    goals: ["understand"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "The material is split into short chunks, each with a main idea, important details and a mini summary; you read one, answer its recall question, and only then move to the next.",
  },
  elaborative_interrogation: {
    howItHelps: "Asking why and how connects facts into explanations that last.",
    bestUseCases: "Cause-and-effect topics, science, history.",
    suggestedMinutes: 20,
    goals: ["understand"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "A tutor conversation in why-chain mode: it states a claim from the material, asks why it is true, evaluates your reasoning and asks the next why; the session ends with a reasoning score.",
  },
  self_explanation: {
    howItHelps: "Explaining each step while solving catches misunderstandings early.",
    bestUseCases: "Math, programming, engineering, science problems.",
    suggestedMinutes: 25,
    goals: ["understand", "practice"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "A tutor conversation that walks through a worked solution or process from the material one step at a time; you explain why each step works before the next appears.",
  },
  socratic_questioning: {
    howItHelps: "Guided questions make you reach the answer instead of being handed it.",
    bestUseCases: "Deep understanding, assumptions, reasoning.",
    suggestedMinutes: 20,
    goals: ["understand", "master_topic"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "A tutor conversation in Socratic mode: it answers with questions (What makes you think that? What evidence supports it? What assumption are you making?) and never hands over the answer; the session ends with feedback on your reasoning.",
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
    availableIn: "now",
    behaviour: "Each worked example shows the problem, every solution step with the reason for it and the final answer, revealed step by step; then you solve a similar problem on your own and RevTaw checks your reasoning, not just the result.",
  },
  faded_worked_examples: {
    howItHelps: "Removing help gradually moves you from guided to independent solving.",
    bestUseCases: "After worked examples, before practice problems.",
    suggestedMinutes: 25,
    goals: ["practice"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "Four problems of one kind: the first comes 90% solved, then 70%, then 40%, then you solve one alone. You write the missing steps and the answer; if one goes badly, the next keeps the same amount of help.",
  },
  practice_problems: {
    howItHelps: "Repetition with feedback builds fluency in calculation-heavy subjects.",
    bestUseCases: "Math, physics, accounting, chemistry.",
    suggestedMinutes: 30,
    goals: ["practice", "master_topic"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "Source-grounded problems at easy, medium, hard or challenge level (or adapted to your mastery). After you answer: the full solution, the explanation of every step and an alternative approach when one is valid.",
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
    availableIn: "now",
    behaviour: "A 5, 10 or 15 minute pass: open mistakes first, then recall prompts on your weakest concepts and the material's likely exam topics — nothing else.",
  },
  teach_back: {
    howItHelps: "Teaching to a learner who asks questions reveals exactly where your understanding thins out.",
    bestUseCases: "After a Feynman session; before explaining a topic to classmates.",
    suggestedMinutes: 20,
    goals: ["understand", "master_topic"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "The AI plays a curious beginner: it asks you to teach a concept, interrupts with the questions a learner would ask whenever something is unclear or skipped, and the session ends with a teaching score, strengths, missing concepts and one suggested improvement.",
  },
  cumulative_review: {
    howItHelps: "Mixing old lessons back in keeps them from fading while you learn the new ones.",
    bestUseCases: "Weekly reviews; long courses.",
    suggestedMinutes: 20,
    goals: ["quick_review", "exam_prep", "memorize"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "Recall prompts are split 60% current material, 20% the previous one, 10% older and 10% the oldest relevant material, each labelled with its source.",
  },
  mixed_practice: {
    howItHelps: "Unpredictable formats stop you from pattern-matching the question type.",
    bestUseCases: "Exams that mix multiple choice, identification, short answer and scenarios.",
    suggestedMinutes: 30,
    goals: ["practice", "exam_prep"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "A practice test with every question type RevTaw can write — multiple choice, true/false, identification, fill in the blank, short answer, essay, scenario, case-based and problem solving — shuffled.",
  },
  exam_simulation: {
    howItHelps: "A rehearsal under real conditions shows how you perform with a clock and no safety net.",
    bestUseCases: "The last days before an exam.",
    suggestedMinutes: 45,
    goals: ["exam_prep"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "Exam mode: timer, random question order, randomised options, no hints, no explanations until the end, automatic submission when time runs out, then the full breakdown.",
  },
  question_generation: {
    howItHelps: "Writing good questions means understanding what matters and how it could be asked.",
    bestUseCases: "Predicting exam questions; group study.",
    suggestedMinutes: 15,
    goals: ["understand", "exam_prep"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "You write questions about the material (with the answer you expect); RevTaw rates each for relevance, clarity, difficulty and accuracy, suggests an improved version, and the session ends with your question set and its average quality.",
  },
  custom_routine: {
    howItHelps: "A routine you repeat removes the daily decision of what to do.",
    bestUseCases: "A fixed pre-exam ritual; a weekly review.",
    suggestedMinutes: 45,
    goals: ["memorize", "understand", "practice", "exam_prep", "quick_review", "master_topic"],
    requiresMaterial: false,
    availableIn: "now",
    behaviour: "Save an ordered combination of methods and minutes (e.g. 25-minute Pomodoro, 10 recall prompts, 10 flashcards, mistake review) and run it as one session with a combined summary.",
  },
  sq3r: {
    howItHelps: "Surveying, questioning and reciting turn passive reading into active study.",
    bestUseCases: "Reading a chapter properly the first time.",
    suggestedMinutes: 30,
    goals: ["understand"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "RevTaw walks you through each stage: survey the outline, summary and key concepts; turn every heading into a question; read section by section with your questions beside the text; recite the answers from memory with the text hidden; then review — your own summary is compared with the chapter and the questions you missed point to what to re-read.",
  },
  pq4r: {
    howItHelps: "Reflecting on why something is true makes it stick far longer than reading twice.",
    bestUseCases: "Dense, conceptual reading.",
    suggestedMinutes: 35,
    goals: ["understand"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "Preview, question, read, reflect (conceptual questions), recite, review — guided stage by stage.",
  },
  scenario_based: {
    howItHelps: "Applying knowledge to a realistic situation is how exams and jobs test it.",
    bestUseCases: "Nursing, medicine, business, CS, law, psychology.",
    suggestedMinutes: 25,
    goals: ["practice", "understand"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "Realistic scenarios set in your field and built from the material: you choose an action from plausible options and justify it; RevTaw grades the choice and the reasoning separately, explains why the best action is best and why yours was or was not.",
  },
  case_based: {
    howItHelps: "Working a full case builds judgement, not just recall.",
    bestUseCases: "Analysis-heavy subjects.",
    suggestedMinutes: 30,
    goals: ["practice", "understand", "master_topic"],
    requiresMaterial: true,
    availableIn: "now",
    behaviour: "Detailed cases with background, data and a complication: you write the problem, the evidence, possible solutions, the best one and your justification; RevTaw scores each part, shows the expert analysis beside yours and keeps your draft if you refresh.",
  },
  pre_testing: {
    howItHelps: "A test before studying tells you where to pay attention; a test after shows the gain.",
    bestUseCases: "Starting a new chapter; measuring a study block.",
    suggestedMinutes: 30,
    goals: ["practice", "master_topic"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "Pre-test → study → post-test on the same concepts, with the improvement displayed.",
  },
  concept_mapping: {
    howItHelps: "Naming the relationship between two ideas is understanding made visible.",
    bestUseCases: "Cause-and-effect, dependencies, hierarchies.",
    suggestedMinutes: 20,
    goals: ["understand"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "A map of concepts linked by causes, requires, leads to, contains, depends on, is an example of.",
  },
  memory_palace: {
    howItHelps: "Spatial memory is strong; attaching facts to places borrows that strength.",
    bestUseCases: "Ordered lists, long sequences, speeches.",
    suggestedMinutes: 15,
    goals: ["memorize"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "Define locations, attach concepts to them, then walk the route and recall each one.",
  },
  story_method: {
    howItHelps: "A story gives unrelated facts a sequence and a reason.",
    bestUseCases: "Lists of facts, dates, names.",
    suggestedMinutes: 15,
    goals: ["memorize"],
    requiresMaterial: true,
    availableIn: "Phase 8",
    behaviour: "Original notes and an academically accurate story version side by side.",
  },
};

export const IMPLEMENTED_METHOD_IDS = STUDY_METHODS.filter((method) => METHOD_BEHAVIOUR[method.id].availableIn === "now").map((method) => method.id) as [
  StudyMethodId,
  ...StudyMethodId[],
];

/** Methods that run through the session builder (flashcards/spaced repetition start from the Flashcards section). */
export const BUILDER_METHOD_IDS = [
  "smart_study",
  "active_recall",
  "retrieval_practice",
  "blurting",
  "feynman",
  "chunking",
  "practice_testing",
  "mixed_practice",
  "exam_simulation",
  "rapid_review",
  "cumulative_review",
  "interleaving",
  "question_generation",
  "worked_examples",
  "faded_worked_examples",
  "practice_problems",
  "scenario_based",
  "case_based",
  "sq3r",
  "error_review",
  "pomodoro",
  "socratic_questioning",
  "elaborative_interrogation",
  "self_explanation",
  "teach_back",
  "spaced_repetition",
  "flashcards",
] as const;

/** Methods whose session is a tutor conversation in a special mode. */
export const TUTOR_METHOD_IDS = ["socratic_questioning", "elaborative_interrogation", "self_explanation", "teach_back"] as const;

/** Methods that run as a practice test in the quiz runner (plus the options they force). */
export const TEST_METHOD_IDS = ["practice_testing", "mixed_practice", "exam_simulation"] as const;
export type TestMethodId = (typeof TEST_METHOD_IDS)[number];
export function isTestMethod(value: string): value is TestMethodId {
  return (TEST_METHOD_IDS as readonly string[]).includes(value);
}

/** Methods whose items run in the recall runner. */
export const RECALL_METHOD_IDS = ["active_recall", "error_review", "retrieval_practice", "rapid_review", "cumulative_review", "interleaving"] as const;
export function isRecallMethod(value: string): boolean {
  return (RECALL_METHOD_IDS as readonly string[]).includes(value);
}

/** Rapid review options (spec: 5, 10 or 15 minutes). */
export const RAPID_REVIEW_MINUTES = [5, 10, 15] as const;
export type TutorMethodId = (typeof TUTOR_METHOD_IDS)[number];
export function isTutorMethod(value: string): value is TutorMethodId {
  return (TUTOR_METHOD_IDS as readonly string[]).includes(value);
}
export type BuilderMethodId = (typeof BUILDER_METHOD_IDS)[number];

export function isBuilderMethod(value: string): value is BuilderMethodId {
  return (BUILDER_METHOD_IDS as readonly string[]).includes(value);
}

export const TIME_PRESETS = [5, 15, 30, 45, 60] as const;

export const SMART_METHOD_ID = "smart_study" as const;

/** Builder recommendation: the implemented methods that fit a goal, best first. */
export function recommendMethods(goal: SessionGoal, hasMaterial: boolean): BuilderMethodId[] {
  const fits = BUILDER_METHOD_IDS.filter((id) => METHOD_BEHAVIOUR[id].goals.includes(goal) && (hasMaterial || !METHOD_BEHAVIOUR[id].requiresMaterial));
  return fits.length ? [...fits] : [...BUILDER_METHOD_IDS.filter((id) => hasMaterial || !METHOD_BEHAVIOUR[id].requiresMaterial)];
}

export function methodName(id: string): string {
  return (STUDY_METHOD_BY_ID as Record<string, { name: string } | undefined>)[id]?.name ?? id;
}
