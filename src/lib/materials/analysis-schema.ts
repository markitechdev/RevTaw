import { z } from "zod";

import { STUDY_METHOD_IDS } from "@/lib/study/methods";

/**
 * Shape of `material_analyses.data`. The model's output is validated against
 * this before anything is stored, and stored rows are re-validated on read so
 * a schema change can never crash the viewer.
 */

const shortText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

export const conceptCategorySchema = z.enum(["memorization", "understanding", "calculation", "application"]);
export type ConceptCategory = z.infer<typeof conceptCategorySchema>;

export const analysisDataSchema = z.object({
  main_topics: z
    .array(z.object({ title: shortText(120), description: optionalText(300) }))
    .max(12)
    .default([]),
  key_concepts: z
    .array(
      z.object({
        name: shortText(120),
        explanation: shortText(400),
        category: conceptCategorySchema.catch("understanding"),
      }),
    )
    .max(20)
    .default([]),
  definitions: z
    .array(z.object({ term: shortText(120), definition: shortText(500) }))
    .max(25)
    .default([]),
  formulas: z
    .array(z.object({ name: optionalText(120), expression: shortText(300), meaning: optionalText(300) }))
    .max(20)
    .default([]),
  important_facts: z.array(shortText(400)).max(15).default([]),
  exam_topics: z
    .array(z.object({ topic: shortText(120), why: optionalText(300) }))
    .max(10)
    .default([]),
  recommended_methods: z
    .array(z.object({ method: z.enum(STUDY_METHOD_IDS), reason: shortText(300) }))
    .max(5)
    .default([]),
  subject_guess: optionalText(80).default(null),
  language: optionalText(40).default(null),
});

export type AnalysisData = z.infer<typeof analysisDataSchema>;

/** Full model response: the data payload plus the promoted scalar fields. */
export const analysisResponseSchema = analysisDataSchema.extend({
  summary: shortText(1200),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).catch("intermediate"),
  estimated_study_minutes: z.coerce.number().int().min(5).max(6000).catch(45),
});

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;

/** Safely reads a stored payload; unknown or outdated shapes degrade to empty lists. */
export function parseAnalysisData(value: unknown): AnalysisData {
  const result = analysisDataSchema.safeParse(value ?? {});
  if (result.success) return result.data;
  return analysisDataSchema.parse({});
}

export const CONCEPT_CATEGORY_LABEL: Record<ConceptCategory, string> = {
  memorization: "Memorization-heavy",
  understanding: "Understanding-heavy",
  calculation: "Calculation-heavy",
  application: "Application-heavy",
};
