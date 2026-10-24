import type { ActivityCategory, ExamPriority, GoalKind, GoalPeriod, PlanMode, StudyTask, TaskReminder, TaskStatus } from "@/lib/supabase/database.types";

/**
 * Labels and options shared by the planner's client and server code. Zod-free
 * for the browser; the form schemas are in `schemas.ts`.
 */

export const EXAM_PRIORITIES: ReadonlyArray<{ id: ExamPriority; label: string; hint: string }> = [
  { id: "low", label: "Low", hint: "A quiz or a minor test" },
  { id: "normal", label: "Normal", hint: "A regular exam" },
  { id: "high", label: "High", hint: "Finals, boards, entrance exams" },
];

export const PRIORITY_LABEL: Record<ExamPriority, string> = { low: "Low", normal: "Normal", high: "High" };

export const PLAN_MODES: ReadonlyArray<{ id: PlanMode; label: string; hint: string }> = [
  { id: "exam", label: "Exam plan", hint: "Spaced coverage, 1-3-7-14 reviews, a simulation at the end" },
  { id: "cram", label: "Cram mode", hint: "Limited time: mistakes, weak areas, definitions and practice only" },
];

export const PLAN_MODE_LABEL: Record<PlanMode, string> = { exam: "Exam plan", cram: "Cram mode" };

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { pending: "Planned", done: "Done", skipped: "Skipped", missed: "Missed" };

export const GOAL_KINDS: ReadonlyArray<{ id: GoalKind; label: string; unit: string; hint: string; periods: GoalPeriod[]; needsMaterial: boolean; defaultTarget: number }> = [
  { id: "focus_minutes", label: "Study time", unit: "min", hint: "e.g. Study 60 minutes today", periods: ["day", "week"], needsMaterial: false, defaultTarget: 60 },
  { id: "flashcards_reviewed", label: "Flashcards reviewed", unit: "cards", hint: "e.g. Complete 50 flashcards this week", periods: ["day", "week"], needsMaterial: false, defaultTarget: 50 },
  { id: "questions_answered", label: "Questions answered", unit: "questions", hint: "Quiz and recall answers", periods: ["day", "week"], needsMaterial: false, defaultTarget: 20 },
  { id: "mastery", label: "Reach mastery", unit: "%", hint: "e.g. Reach 80% mastery of a material", periods: ["once"], needsMaterial: true, defaultTarget: 80 },
  { id: "finish_material", label: "Finish a material", unit: "", hint: "e.g. Finish Chapter 4 before Friday — done when its concepts are strong or you tick it off", periods: ["once"], needsMaterial: true, defaultTarget: 1 },
];

export const GOAL_KIND_BY_ID = Object.fromEntries(GOAL_KINDS.map((kind) => [kind.id, kind])) as Record<GoalKind, (typeof GOAL_KINDS)[number]>;

export const GOAL_PERIOD_LABEL: Record<GoalPeriod, string> = { day: "Today", week: "This week", once: "By a date" };

/* ------------------------------------------------------------------ */
/* Calendar activities (UI phase §26–§27)                              */
/* ------------------------------------------------------------------ */

export const ACTIVITY_CATEGORIES: ReadonlyArray<{ id: ActivityCategory; label: string; hint: string }> = [
  { id: "study", label: "Study", hint: "A study session with a method" },
  { id: "review", label: "Review", hint: "Notes, flashcards or a 1-3-7-14 pass" },
  { id: "assignment", label: "Assignment", hint: "Homework, a paper, a problem set" },
  { id: "project", label: "Project", hint: "Group work, a report, a presentation" },
  { id: "exam", label: "Quiz or exam", hint: "A test date (add an exam for a full plan)" },
  { id: "class", label: "Class", hint: "A lecture, a lab or a consultation" },
  { id: "other", label: "Other", hint: "Anything else on your schedule" },
];

export const ACTIVITY_CATEGORY_IDS = ACTIVITY_CATEGORIES.map((category) => category.id) as [ActivityCategory, ...ActivityCategory[]];

export const ACTIVITY_CATEGORY_LABEL = Object.fromEntries(ACTIVITY_CATEGORIES.map((category) => [category.id, category.label])) as Record<ActivityCategory, string>;

/** Generated tasks have no category of their own: plan tasks are study, 1-3-7-14 passes are reviews. */
export function categoryOf(task: Pick<StudyTask, "category" | "kind">): ActivityCategory {
  return task.category ?? (task.kind === "review" ? "review" : "study");
}

/** Study methods an activity can start (others are plain calendar items, method "activity"). */
export const ACTIVITY_METHODS = ["active_recall", "practice_testing", "feynman", "error_review", "spaced_repetition", "pomodoro", "review", "activity"] as const;
export type ActivityMethod = (typeof ACTIVITY_METHODS)[number];

/** Methods that run on a material (the rest work across everything). */
export function methodNeedsMaterial(method: ActivityMethod): boolean {
  return method !== "error_review" && method !== "spaced_repetition" && method !== "pomodoro" && method !== "activity";
}

export const TASK_REMINDERS: ReadonlyArray<{ id: TaskReminder; label: string }> = [
  { id: "none", label: "No reminder" },
  { id: "at_time", label: "At the time" },
  { id: "10m", label: "10 minutes before" },
  { id: "30m", label: "30 minutes before" },
  { id: "1h", label: "1 hour before" },
  { id: "1d", label: "1 day before" },
  { id: "custom", label: "Custom…" },
];

/** Minutes presets for the daily budget. */
export const DAILY_MINUTE_PRESETS = [15, 30, 45, 60, 90, 120] as const;
