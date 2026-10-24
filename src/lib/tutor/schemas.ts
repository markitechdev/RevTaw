import { z } from "zod";

import type { FlashcardDraft, TutorSource } from "@/lib/tutor/types";
import { assertSameType } from "@/lib/type-assert";

/** Validators for what the tutor model returns (server only; the types are in `types.ts`). */

export const sourceSchema = z.object({
  position: z.number().int().min(0),
  heading: z.string().trim().max(200).nullable().default(null),
  pages: z.string().trim().max(40).nullable().default(null),
  quote: z.string().trim().max(400).default(""),
});
assertSameType<z.output<typeof sourceSchema>, TutorSource>();

export const flashcardDraftSchema = z.object({
  front: z.string().trim().min(1).max(500),
  back: z.string().trim().min(1).max(1000),
});
assertSameType<z.output<typeof flashcardDraftSchema>, FlashcardDraft>();
