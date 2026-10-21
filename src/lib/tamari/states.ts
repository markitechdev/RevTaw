/**
 * Tamari, RevTaw's study companion: the face and voice of the assistant
 * (one AI, one chat — Tamari is how it looks and talks). Client-safe and
 * pure.
 *
 * A state is what Tamari is doing (companion doc §2–§4): it picks a pose (one
 * of the provided pixel-art pictures, never redrawn), a small pixel-stepped
 * motion and the words that say it in text. States follow real things — the
 * AI working, the microphone, a result, the student's data, a quiet spell —
 * never chance. Adding a pose later means one picture set in
 * components/tamari/sprites.ts and one line in TAMARI_STATES.
 */

export const TAMARI_NAME = "Tamari";
export const TAMARI_TAGLINE = "Your study companion";

/** The pictures Tamari has. */
export const TAMARI_POSES = ["reading", "laptop", "serious", "sleeping"] as const;
export type TamariPose = (typeof TAMARI_POSES)[number];

/** Pixel-stepped motions (globals.css `.tamari-*`); all hold still with pixel animations off or reduced motion. */
export type TamariMotion = "idle" | "type" | "think" | "listen" | "talk" | "bounce" | "steam" | "still" | "doze";

export const TAMARI_STATE_IDS = ["idle", "learning", "thinking", "listening", "speaking", "serious", "exam", "confident", "sleepy"] as const;
export type TamariState = (typeof TAMARI_STATE_IDS)[number];

export type TamariStateDefinition = {
  pose: TamariPose;
  motion: TamariMotion;
  /** Blinks now and then (poses that have a closed-eye frame). */
  blinks: boolean;
  /** Said in text wherever the state shows (the picture itself is decorative); localized in lib/tamari/lines.ts. */
  status: string;
};

export const TAMARI_STATES: Record<TamariState, TamariStateDefinition> = {
  /** Waiting: sits quietly, a 1–2 px breath and a blink now and then. */
  idle: { pose: "reading", motion: "idle", blinks: true, status: "Tamari is here" },
  /** RevTaw is working through the student's things: a PDF, notes, a reviewer, a quiz, a plan. */
  learning: { pose: "laptop", motion: "type", blinks: false, status: "Tamari is going through your notes…" },
  /** The AI is writing an answer. */
  thinking: { pose: "laptop", motion: "think", blinks: false, status: "Tamari is thinking…" },
  /** The microphone is on. */
  listening: { pose: "reading", motion: "listen", blinks: false, status: "Tamari is listening…" },
  /** Reading an answer aloud. */
  speaking: { pose: "reading", motion: "talk", blinks: false, status: "Tamari is talking" },
  /** The same thing keeps going wrong: time to work on it. */
  serious: { pose: "serious", motion: "steam", blinks: false, status: "Tamari means business" },
  /** An exam is close (or running): the serious face, held still. */
  exam: { pose: "serious", motion: "still", blinks: false, status: "Exam mode" },
  /** A strong result: one quick bounce. */
  confident: { pose: "reading", motion: "bounce", blinks: true, status: "Tamari is proud of you" },
  /** A long quiet spell. */
  sleepy: { pose: "sleeping", motion: "doze", blinks: false, status: "Tamari is napping" },
};

/** One-off reactions to what just happened: a quick bounce for a right answer, a step to the side for a wrong one. */
export const TAMARI_REACTIONS = ["correct", "wrong"] as const;
export type TamariReaction = (typeof TAMARI_REACTIONS)[number];

export function isTamariState(value: unknown): value is TamariState {
  return typeof value === "string" && (TAMARI_STATE_IDS as readonly string[]).includes(value);
}
