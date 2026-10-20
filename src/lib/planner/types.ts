import { z } from "zod";

import { isIsoDate } from "@/lib/planner/dates";
import type { ExamPriority, GoalKind, GoalPeriod, PlanMode, TaskStatus } from "@/lib/supabase/database.types";

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

export const customTaskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a name.").max(160),
  scheduledFor: isoDate,
  minutes: z.number().int().min(5).max(480),
  method: z.enum(["active_recall", "practice_testing", "feynman", "error_review", "spaced_repetition", "pomodoro", "review"]),
  materialId: z.uuid().nullable(),
  examId: z.uuid().nullable(),
});

export type CustomTaskInput = z.input<typeof customTaskSchema>;

/** Minutes presets for the daily budget. */
export const DAILY_MINUTE_PRESETS = [15, 30, 45, 60, 90, 120] as const;
