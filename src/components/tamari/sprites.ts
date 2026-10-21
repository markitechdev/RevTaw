import type { StaticImageData } from "next/image";

import type { TamariPose } from "@/lib/tamari/states";

import reading64 from "./sprites/reading-64.png";
import reading96 from "./sprites/reading-96.png";
import reading128 from "./sprites/reading-128.png";
import reading192 from "./sprites/reading-192.png";
import reading256 from "./sprites/reading-256.png";
import laptop64 from "./sprites/laptop-64.png";
import laptop96 from "./sprites/laptop-96.png";
import laptop128 from "./sprites/laptop-128.png";
import laptop192 from "./sprites/laptop-192.png";
import laptop256 from "./sprites/laptop-256.png";
import serious64 from "./sprites/serious-64.png";
import serious96 from "./sprites/serious-96.png";
import serious128 from "./sprites/serious-128.png";
import serious192 from "./sprites/serious-192.png";
import serious256 from "./sprites/serious-256.png";
import sleeping64 from "./sprites/sleeping-64.png";
import sleeping96 from "./sprites/sleeping-96.png";
import sleeping128 from "./sprites/sleeping-128.png";
import sleeping192 from "./sprites/sleeping-192.png";
import sleeping256 from "./sprites/sleeping-256.png";
import readingBlink64 from "./sprites/reading-blink-64.png";
import readingBlink96 from "./sprites/reading-blink-96.png";
import readingBlink128 from "./sprites/reading-blink-128.png";
import readingBlink192 from "./sprites/reading-blink-192.png";
import readingBlink256 from "./sprites/reading-blink-256.png";

/**
 * Tamari's pictures: each pose cut out of its navy square (nothing redrawn) on
 * one shared frame, so swapping poses never shifts the character, and saved
 * at a few widths so the browser picks one close to the size on screen. A new
 * pose is one set of files here plus a line in lib/tamari/states.ts.
 *
 * A blink is a second frame of the same pose with the eyes closed (only the
 * eye pixels differ), shown for a moment on top of the open one.
 */
export const SPRITE_WIDTHS = [64, 96, 128, 192, 256] as const;

export const TAMARI_SPRITES: Record<TamariPose, readonly StaticImageData[]> = {
  reading: [reading64, reading96, reading128, reading192, reading256],
  laptop: [laptop64, laptop96, laptop128, laptop192, laptop256],
  serious: [serious64, serious96, serious128, serious192, serious256],
  sleeping: [sleeping64, sleeping96, sleeping128, sleeping192, sleeping256],
};

/** Closed-eye frames, for the poses that blink. */
export const TAMARI_BLINK_SPRITES: Partial<Record<TamariPose, readonly StaticImageData[]>> = {
  reading: [readingBlink64, readingBlink96, readingBlink128, readingBlink192, readingBlink256],
};

/** `srcset` with width descriptors for a set of frames. */
export function spriteSrcSet(frames: readonly StaticImageData[]): string {
  return frames.map((image, index) => `${image.src} ${SPRITE_WIDTHS[index]}w`).join(", ");
}

/** The smallest frame that covers `cssPixels` at a 2x screen (for a plain `src`). */
export function spriteFor(frames: readonly StaticImageData[], cssPixels: number): StaticImageData {
  const wanted = cssPixels * 2;
  const index = SPRITE_WIDTHS.findIndex((width) => width >= wanted);
  return frames[index === -1 ? SPRITE_WIDTHS.length - 1 : index];
}
