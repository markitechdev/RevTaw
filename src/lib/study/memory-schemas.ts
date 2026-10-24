import { z } from "zod";

import type { PalaceInput, PalaceLocation } from "@/lib/study/memory-options";
import { assertSameType } from "@/lib/type-assert";

/**
 * Validators for memory palace routes (the shapes are in `memory-options.ts`).
 * The server checks every save with these; the route editor loads them when
 * it opens, so zod stays out of the study pages' first download.
 */

export const palaceLocationSchema = z.object({
  name: z.string().trim().min(1, "Name every location.").max(80, "Keep location names under 80 characters."),
  detail: z.string().trim().max(160).nullable().default(null),
});
assertSameType<z.output<typeof palaceLocationSchema>, PalaceLocation>();

export const palaceInputSchema = z.object({
  title: z.string().trim().min(1, "Give the palace a name.").max(120),
  locations: z.array(palaceLocationSchema).min(3, "A route needs at least three locations.").max(30, "A route can have up to 30 locations."),
});
assertSameType<z.output<typeof palaceInputSchema>, PalaceInput>();
