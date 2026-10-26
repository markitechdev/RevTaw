import type { ConceptState } from "@/lib/engine/types";
import type { ConceptCategory } from "@/lib/materials/analysis-schema";
import type { StudyMethodId } from "@/lib/study/methods";

/**
 * How to study a concept (research doc §11): a rule table, not a model.
 * The concept's state picks the family and its content category picks
 * within it; overrides for misconceptions, exam distance, minutes and the
 * student's own "not for me" list add preferences and remove methods. Every
 * pick carries a one-line reason. All rules are heuristic. Pure.
 */

export type MethodContext = {
  state: ConceptState;
  category: ConceptCategory;
  openMisconception: boolean;
  /** Days until the nearest exam that covers the concept. */
  daysToExam: number | null;
  minutes: number;
  /** An ordered list to memorize, and how many items it has. */
  orderedListItems?: number;
  /** Rapid guessing or three skips in a block. */
  disengaged?: boolean;
  /** Methods the student marked "not for me". */
  excluded?: readonly StudyMethodId[];
  /** Only these methods can be used here (a Tamari block can't nest a plan-type method). */
  allowed?: ReadonlySet<StudyMethodId>;
  /** A long chapter, where SQ3R or chunking fits better than a pre-test. */
  longChapter?: boolean;
  dueCards?: boolean;
};

export type MethodPick = { method: StudyMethodId; reason: string; rule: string };

type Group = StudyMethodId[];
type Row = { groups: Group[]; avoid: StudyMethodId[]; reason: Partial<Record<StudyMethodId, string>> };

/** Plan-type methods that run their own blocks (they can't sit inside Tamari's plan). */
export const PLAN_METHODS: ReadonlySet<StudyMethodId> = new Set(["smart_study", "pre_testing", "custom_routine"]);

function stateRow(state: ConceptState, category: ConceptCategory, minutes: number, longChapter: boolean): Row {
  switch (state) {
    case "new":
      return {
        groups: [...(minutes >= 15 && !longChapter ? [["pre_testing"] as Group] : []), ["chunking", "sq3r"], ["blurting"]],
        avoid: ["practice_testing", "exam_simulation"],
        reason: {
          pre_testing: "New to you: a short pre-test shows what you already know, then the study block fills the gaps.",
          chunking: "New to you: learn it in small pieces first, then answer easy questions on each piece.",
          sq3r: "New to you and long: survey, question, read, recite and review it in stages.",
          blurting: "New to you: read it, then write down everything you remember.",
        },
      };
    case "weak": {
      const first: Group =
        category === "calculation" || category === "application" ? ["worked_examples"] : category === "memorization" ? ["mnemonics"] : ["chunking", "dual_coding"];
      return {
        groups: [first, ["socratic_questioning"]],
        avoid: ["exam_simulation"],
        reason: {
          worked_examples: "Needs a foundation: watch every step worked out, then try a similar one yourself.",
          mnemonics: "Needs a foundation and it's memory-heavy: give it a hook you can recall.",
          chunking: "Needs a foundation: rebuild it in small pieces with easy questions on each.",
          dual_coding: "Needs a foundation: pair the words with a picture so the idea holds together.",
          socratic_questioning: "Needs a foundation: guided questions lead you to it one step at a time.",
        },
      };
    }
    case "learning": {
      const first: Group = category === "memorization" ? ["flashcards", "active_recall"] : category === "calculation" ? ["self_explanation", "active_recall"] : ["active_recall"];
      return {
        groups: [first, ["retrieval_practice", "elaborative_interrogation"]],
        avoid: [],
        reason: {
          active_recall: "Still learning: pulling it from memory moves it faster than rereading.",
          flashcards: "Still learning and memory-heavy: short self-tests on cards make it stick.",
          self_explanation: "Still learning a calculation: explain each step to yourself as you solve.",
          retrieval_practice: "Still learning: answer it in different formats to make the memory sturdy.",
          elaborative_interrogation: "Still learning: ask why it works, which ties it to what you know.",
        },
      };
    }
    case "developing": {
      const first: Group = category === "calculation" || category === "application" ? ["mixed_practice", "faded_worked_examples", "interleaving"] : ["mixed_practice", "interleaving"];
      return {
        groups: [first, ["concept_mapping"]],
        avoid: [],
        reason: {
          mixed_practice: "Developing: mixed questions teach you to tell it apart from similar ideas.",
          interleaving: "Developing: alternate it with related topics so you learn when each applies.",
          faded_worked_examples: "Developing: worked examples with less help each time, until you solve it alone.",
          concept_mapping: "Developing: map how it connects to the topics around it.",
        },
      };
    }
    case "strong": {
      const first: Group = category === "application" ? ["practice_testing", "scenario_based", "case_based"] : ["practice_testing", "question_generation"];
      return {
        groups: [first, ["teach_back"]],
        avoid: [],
        reason: {
          practice_testing: "Strong: harder practice questions push it toward mastered.",
          question_generation: "Strong: writing your own questions shows how deep it goes.",
          scenario_based: "Strong: apply it to a realistic situation.",
          case_based: "Strong: use it to judge a real-looking case.",
          teach_back: "Strong: teach it back to a learner who asks questions.",
        },
      };
    }
    case "mastered":
      return {
        groups: [["spaced_repetition", "cumulative_review"], ["exam_simulation"]],
        avoid: [],
        reason: {
          spaced_repetition: "Mastered: a quick review when it's due keeps it there.",
          cumulative_review: "Mastered: mix it into a cumulative review now and then.",
          exam_simulation: "Mastered: test it under exam conditions.",
        },
      };
  }
}

/** Picks the method for one concept, with the rule and a one-line reason. */
export function chooseMethod(context: MethodContext): MethodPick {
  const prefer = new Set<StudyMethodId>();
  const remove = new Set<StudyMethodId>(context.excluded ?? []);
  let forced: { methods: StudyMethodId[]; reason: string; rule: string } | null = null;

  if (context.disengaged) {
    forced = { methods: ["pomodoro"], reason: "Lots of quick guesses: take a short break, then switch to a different kind of practice.", rule: "disengaged" };
  } else if (context.openMisconception) {
    forced = {
      methods: context.minutes >= 15 ? ["error_review", "feynman", "teach_back"] : ["error_review"],
      reason: "You were sure, but the answer was wrong: fix the idea behind the mistake, then retest it on another day.",
      rule: "misconception",
    };
    remove.add("practice_testing");
  }
  const examSoon = context.daysToExam !== null && context.daysToExam >= 0 && context.daysToExam <= 3;
  if (examSoon) {
    prefer.add("practice_testing");
    if (context.minutes >= 30) prefer.add("exam_simulation");
    if (context.minutes <= 15) prefer.add("rapid_review");
    for (const method of ["memory_palace", "mind_mapping", "sq3r", "pq4r", "cornell_notes"] as const) remove.add(method);
  }
  if (context.minutes <= 10) {
    for (const method of ["rapid_review", "active_recall"] as const) prefer.add(method);
    if (context.dueCards) prefer.add("flashcards");
    for (const method of ["feynman", "teach_back", "case_based", "memory_palace"] as const) remove.add(method);
  }
  if ((context.orderedListItems ?? 0) >= 7) prefer.add(context.minutes >= 15 ? "memory_palace" : "mnemonics");

  const usable = (method: StudyMethodId) => !remove.has(method) && (!context.allowed || context.allowed.has(method));

  if (forced) {
    const method = forced.methods.find(usable);
    if (method) return { method, reason: forced.reason, rule: forced.rule };
  }

  const row = stateRow(context.state, context.category, context.minutes, Boolean(context.longChapter));
  for (const method of row.avoid) remove.add(method);
  // An ordered list to memorize overrides the family: it needs a structure to hang on.
  for (const method of ["memory_palace", "mnemonics"] as const) {
    if (prefer.has(method) && usable(method)) {
      return { method, reason: "An ordered list to memorize: give it a structure to hang on.", rule: "ordered_list" };
    }
  }
  for (const group of row.groups) {
    const survivors = group.filter(usable);
    if (survivors.length === 0) continue;
    const method = survivors.find((candidate) => prefer.has(candidate)) ?? survivors[0];
    const reason = row.reason[method] ?? "The best fit for where this concept stands.";
    return { method, reason: examSoon ? `${reason} The exam is close, so it stays quick.` : reason, rule: `state:${context.state}` };
  }
  // Every method of the family was removed: fall back to retrieval, which always works.
  const fallback = (["active_recall", "rapid_review", "practice_testing", "flashcards"] as const).find(usable) ?? "active_recall";
  return { method: fallback, reason: "Pulling it from memory is the safe choice when nothing else fits.", rule: "fallback" };
}
