import "server-only";

import { cache } from "react";

import { listMastery } from "@/lib/adaptive/engine";
import { countDueCards } from "@/lib/flashcards/queries";
import { addDays, daysBetween } from "@/lib/planner/dates";
import { readinessScore } from "@/lib/planner/generate";
import { plannerClock } from "@/lib/planner/service";
import type { Exam, MaterialStatus, ReminderStatus, StudyPlan, StudyTask } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type TaskView = StudyTask & {
  /** status "deleted": the file is gone; starting the task opens what was made from it. */
  material: { id: string; title: string; status: MaterialStatus } | null;
  exam: { id: string; title: string; exam_date: string } | null;
  subject: { id: string; name: string } | null;
  /** The activity's reminder row, when it has one (0014). */
  reminders: Array<{ remind_at: string; status: ReminderStatus }>;
};

const TASK_COLUMNS =
  "*, material:materials!study_tasks_material_fk(id, title, status), exam:exams!study_tasks_exam_fk(id, title, exam_date), subject:subjects!study_tasks_subject_fk(id, name), reminders!reminders_task_fk(remind_at, status)";

export type ExamSummary = Exam & {
  subject: { id: string; name: string; color: string | null } | null;
  materials: Array<{ id: string; title: string; status: string }>;
  plan: Pick<StudyPlan, "id" | "mode" | "status" | "minutes_per_day" | "available_days" | "generated_at" | "adjusted_at" | "adjustment_note" | "settings"> | null;
  daysLeft: number;
  tasksDone: number;
  tasksTotal: number;
  averageMastery: number | null;
  readiness: number | null;
};

async function decorateExams(exams: Array<Exam & { subject: ExamSummary["subject"]; exam_materials: Array<{ position: number; material: { id: string; title: string; status: string } | null }>; plan: ExamSummary["plan"] | ExamSummary["plan"][] }>, today: string): Promise<ExamSummary[]> {
  if (exams.length === 0) return [];
  const supabase = await createClient();
  const [{ data: tasks }, mastery] = await Promise.all([
    supabase.from("study_tasks").select("exam_id, status").in("exam_id", exams.map((exam) => exam.id)).limit(5000),
    listMastery(),
  ]);
  return exams.map((exam) => {
    const materials = [...exam.exam_materials].sort((a, b) => a.position - b.position).map((link) => link.material).filter((material): material is { id: string; title: string; status: string } => Boolean(material));
    const materialIds = new Set(materials.map((material) => material.id));
    const rows = mastery.filter((row) => row.concept?.material_id && materialIds.has(row.concept.material_id) && row.attempts > 0);
    const averageMastery = rows.length ? Math.round(rows.reduce((sum, row) => sum + Number(row.mastery), 0) / rows.length) : null;
    const own = (tasks ?? []).filter((task) => task.exam_id === exam.id && task.status !== "skipped");
    const tasksDone = own.filter((task) => task.status === "done").length;
    const plan = Array.isArray(exam.plan) ? (exam.plan[0] ?? null) : exam.plan;
    return {
      ...exam,
      subject: exam.subject,
      materials,
      plan,
      daysLeft: daysBetween(today, exam.exam_date),
      tasksDone,
      tasksTotal: own.length,
      averageMastery,
      readiness: readinessScore({ averageMastery, tasksDone, tasksTotal: own.length }),
    };
  });
}

const EXAM_COLUMNS = "*, subject:subjects!exams_subject_fk(id, name, color), exam_materials(position, material:materials!exam_materials_material_fk(id, title, status)), plan:study_plans!study_plans_exam_fk(id, mode, status, minutes_per_day, available_days, generated_at, adjusted_at, adjustment_note, settings)";

export const listExams = cache(async (options: { includePast?: boolean; includeArchived?: boolean } = {}): Promise<ExamSummary[]> => {
  const supabase = await createClient();
  const { today } = await plannerClock();
  let query = supabase.from("exams").select(EXAM_COLUMNS).order("exam_date").limit(50);
  if (!options.includeArchived) query = query.is("archived_at", null);
  if (!options.includePast) query = query.gte("exam_date", addDays(today, -1));
  const { data, error } = await query;
  if (error) {
    console.error("exams: list failed", error.message);
    return [];
  }
  return decorateExams((data ?? []) as unknown as Parameters<typeof decorateExams>[0], today);
});

/**
 * Lightweight lookups used before the daily adjustment runs. Next.js dedupes
 * identical GET requests within one render, so a page must not read the full
 * exam before writing to it and then read it again with the same query.
 */
export async function getExamTitle(examId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("exams").select("title").eq("id", examId).maybeSingle();
  return data?.title ?? null;
}

export async function getPlanIdForExam(examId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("study_plans").select("id").eq("exam_id", examId).maybeSingle();
  return data?.id ?? null;
}

export async function getExam(examId: string): Promise<(ExamSummary & { tasks: TaskView[] }) | null> {
  const supabase = await createClient();
  const { today } = await plannerClock();
  const { data, error } = await supabase.from("exams").select(EXAM_COLUMNS).eq("id", examId).maybeSingle();
  if (error) {
    console.error("exams: get failed", error.message);
    return null;
  }
  if (!data) return null;
  const [exam] = await decorateExams([data] as unknown as Parameters<typeof decorateExams>[0], today);
  const { data: tasks } = await supabase.from("study_tasks").select(TASK_COLUMNS).eq("exam_id", examId).order("scheduled_for").order("position").limit(1000);
  return { ...exam, tasks: (tasks ?? []) as unknown as TaskView[] };
}

/** The next exam, for the dashboard countdown. */
export const getNextExam = cache(async (): Promise<ExamSummary | null> => {
  const exams = await listExams();
  return exams.find((exam) => exam.daysLeft >= 0) ?? null;
});

export type DueToday = {
  today: string;
  timezone: string | null;
  tasks: TaskView[];
  overdue: TaskView[];
  dueCards: number;
  dueConcepts: Array<{ id: string; name: string; materialId: string | null; retrieval: number }>;
  plannedMinutes: number;
  doneMinutes: number;
};

/** The due-today system (§22 "Due Today", Phase 7): plan tasks, overdue tasks, due cards and fading concepts. */
export const getDueToday = cache(async (): Promise<DueToday> => {
  const supabase = await createClient();
  const { timezone, today } = await plannerClock();
  const [{ data: tasks }, dueCards, mastery] = await Promise.all([
    supabase.from("study_tasks").select(TASK_COLUMNS).lte("scheduled_for", today).gte("scheduled_for", addDays(today, -14)).in("status", ["pending", "done", "missed"]).order("scheduled_for").order("position").limit(200),
    countDueCards(),
    listMastery(),
  ]);
  const rows = (tasks ?? []) as unknown as TaskView[];
  const todays = rows.filter((task) => task.scheduled_for === today);
  const overdue = rows.filter((task) => task.scheduled_for < today && task.status !== "done");
  const now = Date.now();
  const dueConcepts = mastery
    .filter((row) => row.attempts > 0 && row.next_review_at && new Date(row.next_review_at).getTime() <= now && row.concept)
    .sort((a, b) => Number(a.retrieval_strength) - Number(b.retrieval_strength))
    .slice(0, 8)
    .map((row) => ({ id: row.concept!.id, name: row.concept!.name, materialId: row.concept!.material_id, retrieval: Math.round(Number(row.retrieval_strength)) }));
  return {
    today,
    timezone,
    tasks: todays,
    overdue,
    dueCards,
    dueConcepts,
    plannedMinutes: todays.filter((task) => task.status !== "skipped").reduce((sum, task) => sum + task.minutes, 0),
    doneMinutes: todays.filter((task) => task.status === "done").reduce((sum, task) => sum + task.minutes, 0),
  };
});

/** Tasks in a date window (planner agenda), newest plan first within a day. */
export async function listTasks(options: { from: string; to: string }): Promise<TaskView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("study_tasks").select(TASK_COLUMNS).gte("scheduled_for", options.from).lte("scheduled_for", options.to).order("scheduled_for").order("position").limit(500);
  if (error) {
    console.error("study_tasks: list failed", error.message);
    return [];
  }
  return (data ?? []) as unknown as TaskView[];
}

export type CalendarExam = { id: string; title: string; exam_date: string; subject: string | null };

/** Everything the planner calendar shows between two dates: tasks and activities, and exam days. */
export async function listCalendar(options: { from: string; to: string }): Promise<{ tasks: TaskView[]; exams: CalendarExam[] }> {
  const supabase = await createClient();
  const [tasks, { data: exams, error }] = await Promise.all([
    listTasks(options),
    supabase.from("exams").select("id, title, exam_date, subject:subjects!exams_subject_fk(name)").is("archived_at", null).gte("exam_date", options.from).lte("exam_date", options.to).order("exam_date").limit(100),
  ]);
  if (error) console.error("exams: calendar failed", error.message);
  return {
    tasks,
    exams: (exams ?? []).map((exam) => ({ id: exam.id, title: exam.title, exam_date: exam.exam_date, subject: (exam.subject as unknown as { name: string } | null)?.name ?? null })),
  };
}

export const getTask = cache(async (taskId: string): Promise<TaskView | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("study_tasks").select(TASK_COLUMNS).eq("id", taskId).maybeSingle();
  if (error) {
    console.error("study_tasks: get failed", error.message);
    return null;
  }
  return (data as unknown as TaskView | null) ?? null;
});

/** The next standalone 1-3-7-14 review passes, across materials (planner sidebar). */
export async function listReviewCycles(today: string): Promise<TaskView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("study_tasks").select(TASK_COLUMNS).eq("kind", "review").eq("status", "pending").gte("scheduled_for", today).order("scheduled_for").limit(8);
  if (error) console.error("study_tasks: review cycles failed", error.message);
  return (data ?? []) as unknown as TaskView[];
}

/** Upcoming standalone review tasks (the 1-3-7-14 cycle) for a material. */
export async function listReviewTasks(materialId: string): Promise<TaskView[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("study_tasks").select(TASK_COLUMNS).eq("material_id", materialId).eq("kind", "review").neq("status", "skipped").order("scheduled_for").limit(20);
  return (data ?? []) as unknown as TaskView[];
}
