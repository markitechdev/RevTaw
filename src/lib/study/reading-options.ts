/** Guided reading (SQ3R): stages and the state a session keeps. Client-safe. */

export type ReadingMethod = "sq3r";
export type ReadingStage = "survey" | "question" | "read" | "recite" | "review" | "done";

export const READING_STAGES: Record<ReadingMethod, ReadonlyArray<Exclude<ReadingStage, "done">>> = {
  sq3r: ["survey", "question", "read", "recite", "review"],
};

export const READING_STAGE_LABEL: Record<ReadingMethod, Record<Exclude<ReadingStage, "done">, string>> = {
  sq3r: { survey: "Survey", question: "Question", read: "Read", recite: "Recite", review: "Review" },
};

export type ReadingState = {
  stage: ReadingStage;
  sections: Array<{ heading: string; text: string }>;
  survey: { summary: string | null; concepts: string[] };
  expectations: string | null;
  readSections: number[];
};

export const MAX_QUESTIONS_PER_SECTION = 3;

export function isReadingMethod(value: string): value is ReadingMethod {
  return value === "sq3r";
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
  };
}

/** SQ3R's classic move: turn a heading into a question to read for. */
export function suggestQuestion(heading: string, attempt = 0): string {
  const topic = heading.replace(/^(chapter|section|part|unit|lesson)\s*\d*[.:)-]?\s*/i, "").trim() || heading;
  const forms = [`What is ${topic}?`, `How does ${topic} work?`, `Why does ${topic} matter?`];
  return forms[attempt % forms.length];
}
