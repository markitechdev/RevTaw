import { z } from "zod";

import { clampTitle, TITLE_MAX } from "@/lib/text/clamp";

/**
 * A title written by a model. Models sometimes echo a long material title:
 * anything up to 1,000 characters is accepted and cut to fit, so a long title
 * alone never fails a whole generation.
 */
export const modelTitle = (max: number = TITLE_MAX) =>
  z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .transform((value) => clampTitle(value, max));
