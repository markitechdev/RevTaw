import { z } from "zod";

import { isIsoDate } from "@/lib/planner/dates";
import { isClockTime } from "@/lib/planner/time";
import { ACTIVITY_CATEGORY_IDS, ACTIVITY_METHODS, GOAL_KIND_BY_ID, methodNeedsMaterial } from "@/lib/planner/types";
import { MAX_REMINDER_MINUTES } from "@/lib/reminders/time";

/** The planner's form schemas (Server Actions validate with these; the forms import only their types). */

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
