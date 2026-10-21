import { z } from "zod";

import { isIsoDate } from "@/lib/planner/dates";
import { isClockTime } from "@/lib/planner/time";
import { MAX_REMINDER_MINUTES } from "@/lib/reminders/time";
import type { ActivityCategory, ExamPriority, GoalKind, GoalPeriod, PlanMode, StudyTask, TaskReminder, TaskStatus } from "@/lib/supabase/database.types";

/** Labels and form schemas shared by the planner's client and server code. */

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

const isoDate = z.string().refine(isIsoDate, "Enter a valid date.");

export const examFormSchema = z.object({
  title: z.string().trim().min(1, "Give the exam a name.").max(120),
  examDate: isoDate,
  subjectId: z.uuid().nullable(),
  priority: z.enum(["low", "normal", "high"]),
  confidence: z.enum(["guessing", "unsure", "somewhat_confident", "very_confident"]).nullable(),
  topics: z.array(z.string().trim().min(1).max(80)).max(30),
  notes: z.string().trim().max(2000).nullable(),
  materialIds: z.array(z.uuid()).max(30),
  plan: z.object({
    mode: z.enum(["exam", "cram"]),
    availableDays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one study day.").max(7),
    minutesPerDay: z.number().int().min(5).max(480),
  }),
});

export type ExamFormInput = z.input<typeof examFormSchema>;
export type ExamFormValues = z.infer<typeof examFormSchema>;

export const goalFormSchema = z
  .object({
    kind: z.enum(["focus_minutes", "flashcards_reviewed", "questions_answered", "mastery", "finish_material"]),
    period: z.enum(["day", "week", "once"]),
    target: z.number().int().min(1).max(100000),
    materialId: z.uuid().nullable(),
    dueDate: isoDate.nullable(),
    title: z.string().trim().max(120).nullable(),
  })
  .superRefine((value, ctx) => {
    const kind = GOAL_KIND_BY_ID[value.kind];
    if (kind.needsMaterial && !value.materialId) ctx.addIssue({ code: "custom", path: ["materialId"], message: "Choose a material for this goal." });
    if (!kind.periods.includes(value.period)) ctx.addIssue({ code: "custom", path: ["period"], message: "That period does not fit this goal." });
    if (value.kind === "mastery" && value.target > 100) ctx.addIssue({ code: "custom", path: ["target"], message: "Mastery is a percentage." });
  });

export type GoalFormInput = z.input<typeof goalFormSchema>;

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

export const activitySchema = z
  .object({
    title: z.string().trim().min(1, "Give the activity a name.").max(160),
    category: z.enum(ACTIVITY_CATEGORY_IDS),
    scheduledFor: isoDate,
    startsAt: z.string().refine(isClockTime, "Enter a time like 14:30.").nullable(),
    minutes: z.number().int().min(5, "At least 5 minutes.").max(480, "At most 8 hours."),
    method: z.enum(ACTIVITY_METHODS),
    materialId: z.uuid().nullable(),
    subjectId: z.uuid().nullable(),
    examId: z.uuid().nullable(),
    priority: z.enum(["low", "normal", "high"]),
    notes: z.string().trim().max(2000).nullable(),
    reminder: z.enum(["none", "at_time", "10m", "30m", "1h", "1d", "custom"]),
    reminderMinutes: z.number().int().min(0).max(MAX_REMINDER_MINUTES, "Reminders can be up to two weeks before.").nullable(),
  })
  .superRefine((value, ctx) => {
    if (methodNeedsMaterial(value.method) && !value.materialId) ctx.addIssue({ code: "custom", path: ["materialId"], message: "Choose a material for this method." });
    if (value.reminder === "custom" && value.reminderMinutes === null) ctx.addIssue({ code: "custom", path: ["reminderMinutes"], message: "Say how long before the reminder should come." });
    if (value.method !== "activity" && value.category !== "study" && value.category !== "review") ctx.addIssue({ code: "custom", path: ["method"], message: "Only study and review activities start a session." });
  });

export type ActivityInput = z.input<typeof activitySchema>;
export type ActivityValues = z.infer<typeof activitySchema>;

/** Minutes presets for the daily budget. */
export const DAILY_MINUTE_PRESETS = [15, 30, 45, 60, 90, 120] as const;
