/**
 * Tamari, RevTaw's study companion: the face and voice of the assistant
 * (one AI, one chat — Tamari is how it looks and talks). Client-safe and
 * pure.
 *
 * A state is what Tamari is doing; it picks a pose (one of the provided
 * pixel-art pictures, never redrawn), a small pixel-stepped motion and the
 * words that say it in text. Adding a pose later means one picture set in
 * components/tamari/sprites.ts and one line in TAMARI_STATES.
 */

export const TAMARI_NAME = "Tamari";
export const TAMARI_TAGLINE = "Your RevTaw Study Companion";

/** The pictures Tamari has. */
export const TAMARI_POSES = ["reading", "laptop", "serious", "sleeping"] as const;
export type TamariPose = (typeof TAMARI_POSES)[number];

/** Pixel-stepped motions (globals.css `.tamari-*`); all stop under reduced motion. */
export type TamariMotion = "idle" | "listen" | "think" | "talk" | "hop" | "shake" | "doze";

export const TAMARI_STATE_IDS = ["idle", "listening", "thinking", "speaking", "studying", "celebrating", "serious", "sleeping"] as const;
export type TamariState = (typeof TAMARI_STATE_IDS)[number];

export type TamariStateDefinition = {
  pose: TamariPose;
  motion: TamariMotion;
  /** Said in text wherever the state shows (the picture itself is decorative). */
  status: string;
  /** Idle-type motions run only when the student keeps idle animations on. */
  ambient: boolean;
};

export const TAMARI_STATES: Record<TamariState, TamariStateDefinition> = {
  idle: { pose: "reading", motion: "idle", status: "Tamari is here", ambient: true },
  listening: { pose: "reading", motion: "listen", status: "Tamari is listening…", ambient: false },
  thinking: { pose: "laptop", motion: "think", status: "Tamari is thinking…", ambient: false },
  speaking: { pose: "reading", motion: "talk", status: "Tamari is talking", ambient: false },
  studying: { pose: "laptop", motion: "idle", status: "Tamari is studying with you", ambient: true },
  celebrating: { pose: "reading", motion: "hop", status: "Tamari is cheering", ambient: false },
  serious: { pose: "serious", motion: "shake", status: "Tamari means business", ambient: false },
  sleeping: { pose: "sleeping", motion: "doze", status: "Tamari is napping", ambient: true },
};
