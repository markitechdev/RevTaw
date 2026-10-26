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

/** Per-item text limits, stated in the analysis prompt too. */
export const ANALYSIS_LIMITS = { title: 120, description: 300, explanation: 500, definition: 800, fact: 500, expression: 300, reason: 300 } as const;

/**
 * A list where an item that breaks a rule (too long, missing a field) is left out, and a list longer than the
 * maximum is cut to it, instead of the whole analysis failing over one item: the material's other definitions
 * and facts are still worth having.
 */
function lenientList<T extends z.ZodType>(item: T, max: number) {
  return z
    .array(z.unknown())
    .catch([])
    .default([])
    .transform((items) =>
      items.flatMap((value) => {
        const parsed = item.safeParse(value);
        return parsed.success ? [parsed.data as z.output<T>] : [];
      }).slice(0, max),
    );
}

export const analysisDataSchema = z.object({
  main_topics: lenientList(z.object({ title: shortText(ANALYSIS_LIMITS.title), description: optionalText(ANALYSIS_LIMITS.description) }), 12),
  key_concepts: lenientList(
    z.object({
      name: shortText(ANALYSIS_LIMITS.title),
      explanation: shortText(ANALYSIS_LIMITS.explanation),
      category: conceptCategorySchema.catch("understanding"),
    }),
    20,
  ),
  definitions: lenientList(z.object({ term: shortText(ANALYSIS_LIMITS.title), definition: shortText(ANALYSIS_LIMITS.definition) }), 25),
  formulas: lenientList(z.object({ name: optionalText(ANALYSIS_LIMITS.title), expression: shortText(ANALYSIS_LIMITS.expression), meaning: optionalText(ANALYSIS_LIMITS.description) }), 20),
  important_facts: lenientList(shortText(ANALYSIS_LIMITS.fact), 15),
  exam_topics: lenientList(z.object({ topic: shortText(ANALYSIS_LIMITS.title), why: optionalText(ANALYSIS_LIMITS.description) }), 10),
  recommended_methods: lenientList(z.object({ method: z.enum(STUDY_METHOD_IDS), reason: shortText(ANALYSIS_LIMITS.reason) }), 5),
  subject_guess: optionalText(80).catch(null).default(null),
  language: optionalText(40).catch(null).default(null),
});

export type AnalysisData = z.infer<typeof analysisDataSchema>;

/** Full model response: the data payload plus the promoted scalar fields. */
export const analysisResponseSchema = analysisDataSchema.extend({
  // A summary that runs long is cut at a sentence rather than failing the analysis.
  summary: z.string().trim().min(1).transform((value) => (value.length <= 1200 ? value : `${value.slice(0, 1200).replace(/[.!?][^.!?]*$/, (end) => end[0])}`.trim())),
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
