import type { EducationLevel, StudyGoal } from "@/lib/supabase/database.types";

/** Onboarding choices (RevTaw spec §9). Values match the database enums. */

export const EDUCATION_LEVELS: ReadonlyArray<{ value: EducationLevel; label: string }> = [
  { value: "junior_high", label: "Junior High School" },
  { value: "senior_high", label: "Senior High School" },
  { value: "college", label: "College" },
  { value: "graduate", label: "Graduate" },
  { value: "professional_review", label: "Professional review" },
  { value: "other", label: "Other" },
];

export const STUDY_GOALS: ReadonlyArray<{ value: StudyGoal; label: string; hint: string }> = [
  { value: "improve_grades", label: "Improve grades", hint: "Steady progress across subjects" },
  { value: "review_lessons", label: "Review lessons", hint: "Keep up with what was taught" },
  { value: "prepare_quizzes", label: "Prepare for quizzes", hint: "Short, frequent practice" },
  { value: "prepare_exams", label: "Prepare for exams", hint: "Cover a lot of material well" },
  { value: "memorize_information", label: "Memorize information", hint: "Terms, dates, formulas" },
  { value: "understand_concepts", label: "Understand difficult concepts", hint: "Go deeper, not just faster" },
  { value: "practice_problem_solving", label: "Practice problem solving", hint: "Worked examples and drills" },
];

export const SESSION_PRESETS = [5, 15, 30, 45, 60] as const;
export const SESSION_CUSTOM = "custom";
export const SESSION_MIN_MINUTES = 1;
export const SESSION_MAX_MINUTES = 240;

export const EDUCATION_LEVEL_LABEL: Record<EducationLevel, string> = Object.fromEntries(
  EDUCATION_LEVELS.map((item) => [item.value, item.label]),
) as Record<EducationLevel, string>;

export const STUDY_GOAL_LABEL: Record<StudyGoal, string> = Object.fromEntries(
  STUDY_GOALS.map((item) => [item.value, item.label]),
) as Record<StudyGoal, string>;

export function formatSessionMinutes(minutes: number | null): string {
  if (!minutes) return "Not set";
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
