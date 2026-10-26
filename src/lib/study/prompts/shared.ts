import { z } from "zod";

import type { StudentContext } from "@/lib/materials/analyze";
import { EDUCATION_LEVEL_LABEL, STUDY_GOAL_LABEL } from "@/lib/profile/options";

/** Building blocks shared by the study-method prompts. */

export const text = (max: number) => z.string().trim().min(1).max(max);
export const points = z.array(z.string().trim().min(1).max(300)).max(10);

/** Mistake categories the evaluators may assign (matches `public.mistake_type`). */
export const MISTAKE_TYPES = ["misunderstood_concept", "forgotten_information", "calculation_error", "misread_question", "confused_concepts", "unclassified"] as const;

export function studentLine(student: StudentContext): string {
  return (
    [
      student.educationLevel ? `education level: ${EDUCATION_LEVEL_LABEL[student.educationLevel]}` : null,
      student.mainGoal ? `main goal: ${STUDY_GOAL_LABEL[student.mainGoal]}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "not specified"
  );
}

/**
 * How many items to write: up to the count, fewer when the material doesn't have that many distinct things to
 * ask about. A fixed count ("exactly 20") next to "use only the material" leaves a model two ways out, both
 * wrong: rephrase the same fact, or add facts the material doesn't state.
 */
export function upTo(count: number, noun: string): string {
  return `Produce up to ${count} ${noun}: fewer when the material supports fewer distinct ones, and an empty list when it supports none. Never pad with rephrasings of an item or with anything the material doesn't state.`;
}

/** The grounding rule every generator repeats: only the material, never invented sources. */
export const GROUNDING_RULE = "Use ONLY the material between <material> tags. Never invent formulas, data, quotations, page references or definitions the material does not support.";
