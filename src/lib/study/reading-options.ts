/** Guided reading (SQ3R / PQ4R / Cornell notes): stages and the state a session keeps. Client-safe. */

export type ReadingMethod = "sq3r" | "pq4r" | "cornell_notes";
export type ReadingStage = "survey" | "notes" | "question" | "read" | "reflect" | "recite" | "review" | "done";

/**
 * Cornell notes: notes in your own words while you read, cue questions for them, the cues answered with the
 * notes covered, and a summary written without looking.
 */
export const READING_STAGES: Record<ReadingMethod, ReadonlyArray<Exclude<ReadingStage, "done">>> = {
  sq3r: ["survey", "question", "read", "recite", "review"],
  pq4r: ["survey", "question", "read", "reflect", "recite", "review"],
  cornell_notes: ["notes", "question", "recite", "review"],
};

export const READING_STAGE_LABEL: Record<ReadingMethod, Record<Exclude<ReadingStage, "done">, string>> = {
  sq3r: { survey: "Survey", notes: "Notes", question: "Question", read: "Read", reflect: "Reflect", recite: "Recite", review: "Review" },
  pq4r: { survey: "Preview", notes: "Notes", question: "Question", read: "Read", reflect: "Reflect", recite: "Recite", review: "Review" },
  cornell_notes: { survey: "Survey", notes: "Notes", question: "Cues", read: "Read", reflect: "Reflect", recite: "Recite", review: "Summary" },
};

/** A section's notes have to say something: a few words copied in don't make notes. */
export const MIN_NOTE_CHARS = 20;

export type ReadingState = {
  stage: ReadingStage;
  sections: Array<{ heading: string; text: string }>;
  survey: { summary: string | null; concepts: string[] };
  expectations: string | null;
  readSections: number[];
  /** Cornell notes: the student's notes, one per section. */
  notes: string[];
  /** The student's questions their section doesn't answer: set aside rather than recited against something else. */
  unanswered: Array<{ section: number; question: string }>;
};

export const MAX_QUESTIONS_PER_SECTION = 3;

export function isReadingMethod(value: string): value is ReadingMethod {
  return value === "sq3r" || value === "pq4r" || value === "cornell_notes";
}

export function readReadingState(value: unknown): ReadingState | null {
  const state = value as Partial<ReadingState> | null;
  if (!state || typeof state.stage !== "string" || !Array.isArray(state.sections)) return null;
  return {
    stage: state.stage as ReadingStage,
    sections: state.sections.filter((section) => section && typeof section.heading === "string" && typeof section.text === "string"),
    survey: { summary: state.survey?.summary ?? null, concepts: Array.isArray(state.survey?.concepts) ? state.survey.concepts : [] },
    expectations: typeof state.expectations === "string" ? state.expectations : null,
    readSections: Array.isArray(state.readSections) ? state.readSections.filter((value) => typeof value === "number") : [],
    notes: Array.isArray(state.notes) ? state.notes.map((note) => (typeof note === "string" ? note : "")) : [],
    unanswered: Array.isArray(state.unanswered) ? state.unanswered.filter((entry) => entry && typeof entry.question === "string" && typeof entry.section === "number") : [],
  };
}

/** SQ3R's classic move: turn a heading into a question to read for. */
export function suggestQuestion(heading: string, attempt = 0): string {
  const topic = heading.replace(/^(chapter|section|part|unit|lesson)\s*\d*[.:)-]?\s*/i, "").trim() || heading;
  const forms = [`What is ${topic}?`, `How does ${topic} work?`, `Why does ${topic} matter?`];
  return forms[attempt % forms.length];
}
