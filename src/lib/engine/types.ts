/**
 * The six concept states (research doc §7). Stored in concept_mastery.status:
 * "weak" is shown as Needs Foundation, "new" as Not Started.
 */
export type ConceptState = "new" | "weak" | "learning" | "developing" | "strong" | "mastered";

export const CONCEPT_STATES: readonly ConceptState[] = ["new", "weak", "learning", "developing", "strong", "mastered"];

export const STATE_LABEL: Record<ConceptState, string> = {
  new: "Not started",
  weak: "Needs foundation",
  learning: "Learning",
  developing: "Developing",
  strong: "Strong",
  mastered: "Mastered",
};
