import type { TutorMode } from "@/lib/supabase/database.types";

/**
 * Quick actions a student can send to the tutor (spec §19/§20). Client-safe
 * and free of zod; the validators for tutor replies are in `schemas.ts`.
 */
export type TutorActionId =
  | "explain"
  | "simplify"
  | "summarize"
  | "example"
  | "analogy"
  | "step_by_step"
  | "quiz"
  | "guide"
  | "why"
  | "compare"
  | "mnemonic"
  | "visualize"
  | "beginner"
  | "why_wrong"
  | "explain_more";

export type TutorAction = {
  id: TutorActionId;
  label: string;
  /** The message sent on the student's behalf when the action is used without typing. */
  prompt: string;
  /** Shown in the highlight toolbar inside materials and notes. */
  highlight: boolean;
};

export const TUTOR_ACTIONS: readonly TutorAction[] = [
  { id: "explain", label: "Explain", prompt: "Explain this.", highlight: true },
  { id: "simplify", label: "Simplify", prompt: "Simplify this.", highlight: true },
  { id: "summarize", label: "Summarize", prompt: "Summarize this.", highlight: true },
  { id: "example", label: "Example", prompt: "Give me an example.", highlight: true },
  { id: "quiz", label: "Quiz me", prompt: "Quiz me on this.", highlight: true },
  { id: "why", label: "Ask why", prompt: "Why is this true? Keep asking me why until the reason is clear.", highlight: true },
  { id: "compare", label: "Compare", prompt: "Compare this with the related ideas in the material.", highlight: true },
  { id: "mnemonic", label: "Mnemonic", prompt: "Give me a mnemonic for this.", highlight: true },
  { id: "visualize", label: "Visualize", prompt: "Visualize this.", highlight: true },
  { id: "analogy", label: "Analogy", prompt: "Give me an analogy.", highlight: false },
  { id: "step_by_step", label: "Step by step", prompt: "Explain this step by step.", highlight: false },
  { id: "beginner", label: "Like I'm a beginner", prompt: "Explain this like I'm a beginner.", highlight: false },
  { id: "guide", label: "Guide me", prompt: "Guide me without giving the answer.", highlight: false },
  { id: "why_wrong", label: "Why am I wrong?", prompt: "Why is my answer wrong?", highlight: false },
  { id: "explain_more", label: "Explain more", prompt: "Explain more.", highlight: false },
] as const;

export const TUTOR_ACTION_IDS = TUTOR_ACTIONS.map((action) => action.id) as [TutorActionId, ...TutorActionId[]];

export const TUTOR_ACTION_BY_ID: Record<TutorActionId, TutorAction> = Object.fromEntries(TUTOR_ACTIONS.map((action) => [action.id, action])) as Record<TutorActionId, TutorAction>;

export const HIGHLIGHT_ACTIONS = TUTOR_ACTIONS.filter((action) => action.highlight);

/** Actions offered under every tutor answer (spec §19 "then offer actions"). */
export type FollowUpId = "explain_more" | "example" | "simplify" | "analogy" | "test_me" | "add_to_notes" | "create_flashcard";

export const FOLLOW_UPS: ReadonlyArray<{ id: FollowUpId; label: string; action?: TutorActionId }> = [
  { id: "explain_more", label: "Explain more", action: "explain_more" },
  { id: "example", label: "Example", action: "example" },
  { id: "simplify", label: "Simplify", action: "simplify" },
  { id: "analogy", label: "Analogy", action: "analogy" },
  { id: "test_me", label: "Test me", action: "quiz" },
  { id: "add_to_notes", label: "Add to notes" },
  { id: "create_flashcard", label: "Create flashcard" },
];

export const FOLLOW_UP_IDS = FOLLOW_UPS.map((item) => item.id) as [FollowUpId, ...FollowUpId[]];

export const TUTOR_MODES: ReadonlyArray<{ id: TutorMode; label: string; description: string }> = [
  { id: "tutor", label: "Direct answers", description: "Shortest clear answer first, then options to go deeper." },
  { id: "guided", label: "Guide me", description: "Hints and leading questions instead of the answer." },
  { id: "socratic", label: "Socratic questioning", description: "The tutor answers with questions that test your reasoning." },
  { id: "elaborative", label: "Elaborative interrogation", description: "Why and how chains until the cause is clear." },
  { id: "self_explanation", label: "Self-explanation", description: "You explain each step of a solution; the tutor checks the reasoning." },
  { id: "teach_back", label: "Teach-back", description: "The AI is the learner: you teach, it asks when something is unclear." },
];

export const TUTOR_MODE_BY_ID: Record<TutorMode, { id: TutorMode; label: string; description: string }> = Object.fromEntries(TUTOR_MODES.map((mode) => [mode.id, mode])) as Record<
  TutorMode,
  { id: TutorMode; label: string; description: string }
>;

/** A passage of the material a tutor answer is grounded in (validated by `sourceSchema`). */
export type TutorSource = { position: number; heading: string | null; pages: string | null; quote: string };

/** A flashcard the tutor offers to add (validated by `flashcardDraftSchema`). */
export type FlashcardDraft = { front: string; back: string };

export const GROUNDING_LABEL: Record<"material" | "partial" | "general" | "not_found", string> = {
  material: "Based on your material",
  partial: "Based on your material + additional explanation",
  general: "Additional explanation (not from your material)",
  not_found: "Not covered by your material",
};
