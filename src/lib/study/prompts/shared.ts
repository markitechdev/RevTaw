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

/** The grounding rule every generator repeats: only the material, never invented sources. */
export const GROUNDING_RULE = "Use ONLY the material between <material> tags. Never invent formulas, data, quotations, page references or definitions the material does not support.";
