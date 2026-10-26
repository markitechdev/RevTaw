import "server-only";

import { listMastery } from "@/lib/adaptive/engine";
import { conceptMaterialIds, isWeakTopic } from "@/lib/adaptive/mastery";
import { conceptCoverage } from "@/lib/concepts/service";
import { ServiceError } from "@/lib/errors";
import { countDueCards } from "@/lib/flashcards/queries";
import { parseAnalysisData } from "@/lib/materials/analysis-schema";
import { addDays, dateIn, daysBetween, isIsoDate, todayIn, weekdayOf } from "@/lib/planner/dates";
import { generatePlan, type PlanMaterial, type PlannedTask } from "@/lib/planner/generate";
import { coveredMastery, partlyPracticed } from "@/lib/planner/material-progress";
import { activitySchema, examFormSchema, type ExamFormValues } from "@/lib/planner/schemas";
import { methodNeedsMaterial } from "@/lib/planner/types";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { cancelTaskReminder, syncTaskReminder } from "@/lib/reminders/service";
import type { PlanMode, StudyPlan, StudyTask } from "@/lib/supabase/database.types";
import { readPages } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";
import { clampText, clampTitle } from "@/lib/text/clamp";

type Client = Awaited<ReturnType<typeof createClient>>;

/** A plan, exam, task or goal that cannot be changed (not found, out of range ...). */
export class PlannerError extends ServiceError {
  override readonly name = "PlannerError";
}

/** The student's time zone (null = UTC) and today's date in it. */
export async function plannerClock(): Promise<{ timezone: string | null; today: string }> {
  const { profile } = await getCurrentUserWithProfile();
  const timezone = profile?.timezone ?? null;
  return { timezone, today: todayIn(timezone) };
}

async function loadExam(supabase: Client, examId: string) {
  const { data, error } = await supabase.from("exams").select("*").eq("id", examId).maybeSingle();
  if (error) throw new Error(`exams: load failed: ${error.message}`);
  if (!data) throw new PlannerError("Exam not found.", 404);
  return data;
}

async function loadPlan(supabase: Client, planId: string): Promise<StudyPlan> {
  const { data, error } = await supabase.from("study_plans").select("*").eq("id", planId).maybeSingle();
  if (error) throw new Error(`study_plans: load failed: ${error.message}`);
  if (!data) throw new PlannerError("Plan not found.", 404);
  return data;
}

async function loadTask(supabase: Client, taskId: string): Promise<StudyTask> {
  const { data, error } = await supabase.from("study_tasks").select("*").eq("id", taskId).maybeSingle();
  if (error) throw new Error(`study_tasks: load failed: ${error.message}`);
  if (!data) throw new PlannerError("Task not found.", 404);
  return data;
}

async function syncExamMaterials(supabase: Client, examId: string, materialIds: string[]): Promise<boolean> {
  const { data: existing } = await supabase.from("exam_materials").select("material_id").eq("exam_id", examId);
  const current = new Set((existing ?? []).map((row) => row.material_id));
  const wanted = new Set(materialIds);
  const toRemove = [...current].filter((id) => !wanted.has(id));
  const toAdd = materialIds.filter((id) => !current.has(id));
  if (toRemove.length) await supabase.from("exam_materials").delete().eq("exam_id", examId).in("material_id", toRemove);
  if (toAdd.length) {
    const { error } = await supabase.from("exam_materials").insert(toAdd.map((materialId) => ({ exam_id: examId, material_id: materialId, position: materialIds.indexOf(materialId) })));
    if (error) throw new PlannerError("One of the materials could not be attached to the exam.", 400);
  }
  if (toAdd.length === 0 && toRemove.length === 0) {
    for (const [index, materialId] of materialIds.entries()) await supabase.from("exam_materials").update({ position: index }).eq("exam_id", examId).eq("material_id", materialId);
  }
  return toAdd.length > 0 || toRemove.length > 0;
}

/** Creates the exam, attaches its materials and generates the first plan. */
export async function createExam(raw: unknown): Promise<{ examId: string }> {
  const parsed = examFormSchema.safeParse(raw);
  if (!parsed.success) throw new PlannerError(parsed.error.issues[0]?.message ?? "Check the exam details.", 400);
  const input = parsed.data;
  const { today } = await plannerClock();
  if (daysBetween(today, input.examDate) < 0) throw new PlannerError("The exam date is in the past.", 400);
  const supabase = await createClient();
  const { data: exam, error } = await supabase
    .from("exams")
    .insert({ title: input.title, exam_date: input.examDate, subject_id: input.subjectId, priority: input.priority, confidence: input.confidence, topics: input.topics, notes: input.notes })
    .select("id")
    .single();
  if (error || !exam) throw new Error(`exams: insert failed: ${error?.message}`);
  try {
    await syncExamMaterials(supabase, exam.id, input.materialIds);
    await generatePlanForExam(exam.id, input.plan);
  } catch (planError) {
    // No half-made exam without a plan: the student can simply try again.
    await supabase.from("exams").delete().eq("id", exam.id);
    throw planError;
  }
  return { examId: exam.id };
}

/** Updates the exam; a new date or material set regenerates the plan (§30 "plans adjust"). */
export async function updateExam(examId: string, raw: unknown): Promise<void> {
  const parsed = examFormSchema.safeParse(raw);
  if (!parsed.success) throw new PlannerError(parsed.error.issues[0]?.message ?? "Check the exam details.", 400);
  const input = parsed.data;
  const supabase = await createClient();
  const exam = await loadExam(supabase, examId);
  const { error } = await supabase
    .from("exams")
    .update({ title: input.title, exam_date: input.examDate, subject_id: input.subjectId, priority: input.priority, confidence: input.confidence, topics: input.topics, notes: input.notes })
    .eq("id", examId);
  if (error) throw new Error(`exams: update failed: ${error.message}`);
  const materialsChanged = await syncExamMaterials(supabase, examId, input.materialIds);
  const { data: plan } = await supabase.from("study_plans").select("id, mode, available_days, minutes_per_day").eq("exam_id", examId).maybeSingle();
  const settingsChanged = !plan || plan.mode !== input.plan.mode || plan.minutes_per_day !== input.plan.minutesPerDay || plan.available_days.join(",") !== [...input.plan.availableDays].sort().join(",");
  if (!plan || materialsChanged || settingsChanged || exam.exam_date !== input.examDate) {
    await generatePlanForExam(examId, input.plan, {
      note: !plan ? null : materialsChanged ? "Regenerated: the exam's materials changed." : exam.exam_date !== input.examDate ? "Regenerated: the exam date moved." : "Regenerated with new settings.",
    });
  }
}

export async function deleteExam(examId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("exams").delete().eq("id", examId);
  if (error) throw new Error(`exams: delete failed: ${error.message}`);
}

export async function archiveExam(examId: string, archived: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("exams").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", examId);
  if (error) throw new Error(`exams: archive failed: ${error.message}`);
}

/** Everything the generator needs about one material, from analysis, mastery, mistakes and decks. */
async function planMaterials(supabase: Client, materialIds: string[]): Promise<PlanMaterial[]> {
  if (materialIds.length === 0) return [];
  const [{ data: materials }, { data: analyses }, { data: mistakes }, { data: decks }, mastery] = await Promise.all([
    supabase.from("materials").select("id, title, status").in("id", materialIds),
    supabase.from("material_analyses").select("material_id, difficulty, estimated_study_minutes, data").in("material_id", materialIds),
    supabase.from("mistakes").select("material_id").in("material_id", materialIds).is("resolved_at", null).limit(1000),
    supabase.from("flashcard_decks").select("material_id").in("material_id", materialIds).eq("status", "ready"),
    listMastery(),
  ]);
  const analysisByMaterial = new Map((analyses ?? []).map((row) => [row.material_id, row]));
  const mistakeCount = new Map<string, number>();
  for (const row of mistakes ?? []) if (row.material_id) mistakeCount.set(row.material_id, (mistakeCount.get(row.material_id) ?? 0) + 1);
  const deckMaterials = new Set((decks ?? []).map((row) => row.material_id));
  // A material whose file was deleted stays on the exam (its concepts still count) but gets no new tasks.
  const found = materialIds.flatMap((id) => (materials ?? []).filter((material) => material.id === id && material.status !== "deleted"));
  return found.map((material) => {
      const analysis = analysisByMaterial.get(material.id);
      const data = analysis ? parseAnalysisData(analysis.data) : null;
      const concepts = data?.key_concepts ?? [];
      const deep = concepts.filter((concept) => concept.category === "understanding" || concept.category === "application").length;
      const rows = mastery.filter((row) => row.attempts > 0 && conceptMaterialIds(row.concept).includes(material.id));
      const average = rows.length ? rows.reduce((sum, row) => sum + Number(row.mastery), 0) / rows.length : null;
      return {
        id: material.id,
        title: material.title,
        estimatedMinutes: analysis?.estimated_study_minutes ?? null,
        difficulty: analysis?.difficulty ?? null,
        conceptHeavy: concepts.length > 0 && deep / concepts.length >= 0.5,
        mastery: average,
        coverage: conceptCoverage(
          concepts.map((concept) => concept.name),
          rows.map((row) => row.concept?.name ?? ""),
        ),
        weakConcepts: rows.filter(isWeakTopic).map((row) => row.concept?.name ?? "").filter(Boolean).slice(0, 6),
        openMistakes: mistakeCount.get(material.id) ?? 0,
        hasFlashcards: deckMaterials.has(material.id),
      };
    });
}

function taskRow(planId: string, examId: string, task: PlannedTask) {
  return {
    plan_id: planId,
    exam_id: examId,
    material_id: task.materialId,
    kind: "plan" as const,
    method: task.method,
    title: clampTitle(task.title),
    reason: clampText(task.reason, 400),
    scheduled_for: task.scheduledFor,
    position: task.position,
    minutes: task.minutes,
    concepts: task.concepts,
  };
}

/**
 * (Re)generates the plan for an exam. Finished tasks are kept as history;
 * every other task is replaced by the new schedule from today onward.
 */
export async function generatePlanForExam(examId: string, settings: ExamFormValues["plan"], options: { note?: string | null } = {}): Promise<{ planId: string; tasks: number; warnings: string[] }> {
  const supabase = await createClient();
  const exam = await loadExam(supabase, examId);
  const { today } = await plannerClock();
  const { data: links } = await supabase.from("exam_materials").select("material_id, position").eq("exam_id", examId).order("position");
  const materialIds = (links ?? []).map((row) => row.material_id);
  const [materials, dueCards] = await Promise.all([planMaterials(supabase, materialIds), countDueCards()]);
  const availableDays = [...new Set(settings.availableDays)].sort((a, b) => a - b);
  const generated = generatePlan({
    today,
    examDate: exam.exam_date,
    examTitle: exam.title,
    topics: exam.topics,
    availableDays,
    minutesPerDay: settings.minutesPerDay,
    mode: settings.mode,
    confidence: exam.confidence,
    priority: exam.priority,
    materials,
    dueCards,
  });
  const { data: plan, error } = await supabase
    .from("study_plans")
    .upsert(
      {
        exam_id: examId,
        mode: generated.mode,
        status: "active",
        start_date: today,
        end_date: exam.exam_date,
        available_days: availableDays,
        minutes_per_day: settings.minutesPerDay,
        settings: { requestedMode: settings.mode, warnings: generated.warnings },
        generated_at: new Date().toISOString(),
        adjusted_at: null,
        adjustment_note: options.note ?? null,
      },
      { onConflict: "exam_id" },
    )
    .select("id")
    .single();
  if (error || !plan) throw new Error(`study_plans: upsert failed: ${error?.message}`);
  // The new schedule goes in before the old one comes out, so a failed save never leaves the exam without tasks.
  const previous = await readPages(
    (from, to) => supabase.from("study_tasks").select("id").eq("plan_id", plan.id).neq("status", "done").order("id").range(from, to),
    10_000,
  );
  if (generated.tasks.length) {
    const { error: insertError } = await supabase.from("study_tasks").insert(generated.tasks.map((task) => taskRow(plan.id, examId, task)));
    if (insertError) throw new Error(`study_tasks: insert failed: ${insertError.message}`);
  }
  const previousIds = previous.map((row) => row.id);
  for (let index = 0; index < previousIds.length; index += 200) {
    const { error: deleteError } = await supabase.from("study_tasks").delete().in("id", previousIds.slice(index, index + 200));
    if (deleteError) throw new Error(`study_tasks: removing the old schedule failed: ${deleteError.message}`);
  }
  return { planId: plan.id, tasks: generated.tasks.length, warnings: generated.warnings };
}

export type RebalanceResult = { changed: boolean; note: string | null };

/**
 * Daily adjustment (§30): missed tasks move forward into free days, a
 * material that is already strong loses a task, a material that is still
 * weak gains one. Runs at most once per calendar day per plan.
 */
export async function rebalancePlan(planId: string, options: { force?: boolean } = {}): Promise<RebalanceResult> {
  const supabase = await createClient();
  const plan = await loadPlan(supabase, planId);
  const { timezone, today } = await plannerClock();
  if (plan.status !== "active") return { changed: false, note: plan.adjustment_note };
  if (!options.force && plan.adjusted_at && dateIn(plan.adjusted_at, timezone) === today) return { changed: false, note: plan.adjustment_note };
  // Claim the adjustment first: the update matches only while adjusted_at is as read, so when two tabs (or
  // Home and the planner) open at once, one of them adjusts the plan and the other leaves it.
  const claim = supabase.from("study_plans").update({ adjusted_at: new Date().toISOString() }).eq("id", plan.id).eq("status", "active");
  const { data: claimed, error: claimError } = await (plan.adjusted_at ? claim.eq("adjusted_at", plan.adjusted_at) : claim.is("adjusted_at", null)).select("id");
  if (claimError) throw new Error(`study_plans: adjustment claim failed: ${claimError.message}`);
  if (!claimed?.length) return { changed: false, note: plan.adjustment_note };
  const exam = await loadExam(supabase, plan.exam_id);
  if (daysBetween(today, exam.exam_date) < 0) {
    await supabase.from("study_plans").update({ status: "completed", adjusted_at: new Date().toISOString() }).eq("id", plan.id);
    return { changed: true, note: "The exam date has passed; the plan is complete." };
  }
  const tasks = await readPages((from, to) => supabase.from("study_tasks").select("*").eq("plan_id", plan.id).order("scheduled_for").order("position").order("id").range(from, to), 5000);
  const notes: string[] = [];
  const allowed = new Set(plan.available_days);
  const usedByDay = new Map<string, number>();
  for (const task of tasks) if (task.status === "pending" || task.status === "done") usedByDay.set(task.scheduled_for, (usedByDay.get(task.scheduled_for) ?? 0) + task.minutes);
  const nextFreeDay = (minutes: number): string | null => {
    for (let offset = 0; offset < 120; offset += 1) {
      const date = addDays(today, offset);
      if (daysBetween(date, exam.exam_date) <= 0) return null;
      if (!allowed.has(weekdayOf(date))) continue;
      if ((usedByDay.get(date) ?? 0) + minutes <= plan.minutes_per_day + 10) return date;
    }
    return null;
  };

  // 1. Missed tasks move forward (newest reasons first so nothing silently vanishes).
  const overdue = tasks.filter((task) => task.status === "pending" && task.scheduled_for < today);
  let moved = 0;
  let dropped = 0;
  for (const task of overdue) {
    if (task.kind === "plan" && task.scheduled_for === plan.end_date) continue;
    const date = nextFreeDay(task.minutes);
    if (date) {
      await supabase.from("study_tasks").update({ scheduled_for: date, position: 50 + moved, status: "pending" }).eq("id", task.id);
      usedByDay.set(date, (usedByDay.get(date) ?? 0) + task.minutes);
      moved += 1;
    } else {
      await supabase.from("study_tasks").update({ status: "missed" }).eq("id", task.id);
      dropped += 1;
    }
  }
  if (moved) notes.push(`Moved ${moved} missed task${moved === 1 ? "" : "s"} forward.`);
  if (dropped) notes.push(`${dropped} missed task${dropped === 1 ? "" : "s"} no longer fit before the exam.`);

  // 2. Performance: strong materials lose a task, weak ones gain one.
  const { data: links } = await supabase.from("exam_materials").select("material_id").eq("exam_id", exam.id);
  const materials = await planMaterials(supabase, (links ?? []).map((row) => row.material_id));
  const daysLeft = daysBetween(today, exam.exam_date);
  for (const material of materials) {
    if (material.mastery === null) continue;
    const pending = tasks.filter((task) => task.status === "pending" && task.material_id === material.id && task.scheduled_for >= today && task.kind === "plan");
    // Strong means the whole material: its concepts not practiced yet count as 0. Weak means the concepts
    // practiced so far are going badly.
    const shown = coveredMastery(material.mastery, material.coverage) ?? material.mastery;
    const partial = partlyPracticed(material.coverage) ? material.coverage : null;
    if (shown >= 85 && pending.length > 2) {
      const victim = [...pending].reverse().find((task) => task.method === "active_recall" || task.method === "review");
      if (victim) {
        await supabase.from("study_tasks").update({ status: "skipped", reason: `${victim.reason ?? ""} Skipped by RevTaw: ${material.title} is already at ${Math.round(shown)}% mastery.`.trim().slice(0, 400) }).eq("id", victim.id);
        notes.push(`${material.title} is strong (${Math.round(shown)}%): one recall task skipped.`);
      }
    } else if (material.mastery < 40 && daysLeft >= 2) {
      const alreadyAdded = tasks.some((task) => task.material_id === material.id && task.status === "pending" && task.reason?.startsWith("Added by RevTaw"));
      const date = alreadyAdded ? null : nextFreeDay(15);
      if (date) {
        await supabase.from("study_tasks").insert({
          plan_id: plan.id,
          exam_id: exam.id,
          material_id: material.id,
          kind: "plan",
          method: "active_recall",
          title: clampTitle(`Extra recall: ${material.title}`),
          reason: clampText(`Added by RevTaw: ${material.title} is at ${Math.round(material.mastery)}% mastery${partial ? ` on the ${partial.practiced} of ${partial.total} concepts practiced so far` : ""}${material.weakConcepts.length ? ` (${material.weakConcepts.slice(0, 2).join(", ")})` : ""}.`, 400),
          scheduled_for: date,
          position: 40,
          minutes: 15,
          concepts: material.weakConcepts.slice(0, 6),
        });
        usedByDay.set(date, (usedByDay.get(date) ?? 0) + 15);
        notes.push(`${material.title} is weak (${Math.round(material.mastery)}%${partial ? ` on ${partial.practiced} of ${partial.total} concepts` : ""}): an extra recall task was added.`);
      }
    }
  }

  const note = notes.length ? notes.join(" ") : null;
  await supabase.from("study_plans").update({ adjusted_at: new Date().toISOString(), adjustment_note: note ?? plan.adjustment_note }).eq("id", plan.id);
  return { changed: notes.length > 0, note: note ?? plan.adjustment_note };
}

/** Runs the daily adjustment for every active plan (called from the planner and dashboard). */
export async function rebalanceAllPlans(): Promise<string[]> {
  const supabase = await createClient();
  const { data: plans } = await supabase.from("study_plans").select("id").eq("status", "active").limit(20);
  const notes: string[] = [];
  for (const plan of plans ?? []) {
    try {
      const result = await rebalancePlan(plan.id);
      if (result.changed && result.note) notes.push(result.note);
    } catch (error) {
      console.error("study_plans: rebalance failed", error);
    }
  }
  return notes;
}

export async function updatePlanSettings(planId: string, settings: { mode: PlanMode; availableDays: number[]; minutesPerDay: number }): Promise<void> {
  const supabase = await createClient();
  const plan = await loadPlan(supabase, planId);
  await generatePlanForExam(plan.exam_id, settings, { note: "Regenerated with new settings." });
}

export async function regeneratePlan(planId: string): Promise<void> {
  const supabase = await createClient();
  const plan = await loadPlan(supabase, planId);
  await generatePlanForExam(plan.exam_id, { mode: (plan.settings as { requestedMode?: PlanMode } | null)?.requestedMode ?? plan.mode, availableDays: plan.available_days, minutesPerDay: plan.minutes_per_day }, { note: "Regenerated from today's mastery, mistakes and due reviews." });
}

/** Marks a task done (optionally with the session that completed it) and closes the plan when nothing remains. */
export async function completeTask(taskId: string, sessionId: string | null = null): Promise<void> {
  const supabase = await createClient();
  const task = await loadTask(supabase, taskId);
  if (task.status === "done") return;
  const { error } = await supabase.from("study_tasks").update({ status: "done", completed_at: new Date().toISOString(), session_id: sessionId ?? task.session_id }).eq("id", taskId);
  if (error) throw new Error(`study_tasks: complete failed: ${error.message}`);
  await cancelTaskReminder(supabase, taskId);
}

/** Called from session completion: closes the task a session was started from. */
export async function completeTaskForSession(supabase: Client, taskId: string, sessionId: string): Promise<void> {
  const { error } = await supabase.from("study_tasks").update({ status: "done", completed_at: new Date().toISOString(), session_id: sessionId }).eq("id", taskId).eq("status", "pending");
  if (error) console.error("study_tasks: complete for session failed", error.message);
  else await cancelTaskReminder(supabase, taskId);
}

export async function skipTask(taskId: string): Promise<void> {
  const supabase = await createClient();
  const task = await loadTask(supabase, taskId);
  if (task.status !== "pending" && task.status !== "missed") throw new PlannerError("Only planned tasks can be skipped.", 409);
  const { error } = await supabase.from("study_tasks").update({ status: "skipped" }).eq("id", taskId);
  if (error) throw new Error(`study_tasks: skip failed: ${error.message}`);
  await cancelTaskReminder(supabase, taskId);
}

export async function reopenTask(taskId: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("study_tasks").update({ status: "pending", completed_at: null }).eq("id", taskId).select("*").maybeSingle();
  if (error) throw new Error(`study_tasks: reopen failed: ${error.message}`);
  // A reopened activity gets its reminder back if the time is still ahead.
  if (data) await syncTaskReminder(supabase, data, (await plannerClock()).timezone);
}

/**
 * Moves a task to another day (Tamari's "Move this to Friday", companion doc
 * §15): never into the past, never past its exam. The time of day stays and
 * the reminder follows. A missed or skipped task moved ahead is pending again.
 */
export async function moveTask(taskId: string, date: string): Promise<{ scheduledFor: string; remindAt: string | null }> {
  const supabase = await createClient();
  const { timezone, today } = await plannerClock();
  if (!isIsoDate(date)) throw new PlannerError("Pick a day for the task.", 400);
  if (date < today) throw new PlannerError("That day has already passed. Pick today or a day ahead.", 400);
  const task = await loadTask(supabase, taskId);
  if (task.status === "done") throw new PlannerError("That task is already done.", 409);
  if (task.exam_id) {
    const { data: exam } = await supabase.from("exams").select("exam_date").eq("id", task.exam_id).maybeSingle();
    if (exam && date > exam.exam_date) throw new PlannerError("That's after the exam. Pick a day before it.", 400);
  }
  const { data, error } = await supabase.from("study_tasks").update({ scheduled_for: date, status: "pending" }).eq("id", taskId).select("*").single();
  if (error || !data) throw new PlannerError("The task could not be moved. Please try again.", 400);
  const { remindAt } = await syncTaskReminder(supabase, data, timezone);
  return { scheduledFor: data.scheduled_for, remindAt };
}

export async function deleteTask(taskId: string): Promise<void> {
  const supabase = await createClient();
  const task = await loadTask(supabase, taskId);
  if (task.kind === "plan") throw new PlannerError("Plan tasks are skipped, not deleted; regenerate the plan to change it.", 409);
  const { error } = await supabase.from("study_tasks").delete().eq("id", taskId);
  if (error) throw new Error(`study_tasks: delete failed: ${error.message}`);
}

/**
 * Adds or edits a calendar activity (UI phase §26): your own item on the
 * schedule, with a time, subject, material, priority, notes and a reminder.
 * Study and review activities start a session of their method; the other
 * categories are plain calendar items. Generated plan and review tasks are
 * changed through their plan, not here.
 */
export async function saveActivity(raw: unknown, taskId: string | null = null): Promise<{ taskId: string; remindAt: string | null }> {
  const parsed = activitySchema.safeParse(raw);
  if (!parsed.success) throw new PlannerError(parsed.error.issues[0]?.message ?? "Check the activity details.", 400);
  const input = parsed.data;
  const supabase = await createClient();
  const { timezone } = await plannerClock();
  const fields = {
    title: input.title,
    category: input.category,
    method: input.method,
    scheduled_for: input.scheduledFor,
    starts_at: input.startsAt,
    minutes: input.minutes,
    material_id: methodNeedsMaterial(input.method) || input.method === "activity" ? input.materialId : null,
    subject_id: input.subjectId,
    priority: input.priority,
    notes: input.notes || null,
    reminder: input.reminder,
    reminder_minutes: input.reminder === "custom" ? input.reminderMinutes : null,
  };
  let row: StudyTask | null = null;
  if (taskId) {
    const existing = await loadTask(supabase, taskId);
    if (existing.kind !== "custom") throw new PlannerError("Planned tasks change with their plan. Edit the exam's plan instead.", 409);
    const { data, error } = await supabase.from("study_tasks").update(fields).eq("id", taskId).select("*").single();
    if (error || !data) throw new PlannerError("The activity could not be saved. Check the material and subject.", 400);
    row = data;
  } else {
    const { data, error } = await supabase
      .from("study_tasks")
      .insert({ ...fields, kind: "custom", exam_id: input.examId, reason: "Added by you.", position: 90 })
      .select("*")
      .single();
    if (error || !data) throw new PlannerError("The activity could not be added. Check the material, subject and exam.", 400);
    row = data;
  }
  const { remindAt } = await syncTaskReminder(supabase, row, timezone);
  return { taskId: row.id, remindAt };
}

/** Schedules the optional 1-3-7-14 review cycle for a material (§16 "1-3-7-14 Review"). */
export async function scheduleReviewCycle(materialId: string, from?: string): Promise<{ created: number; dates: string[] }> {
  const supabase = await createClient();
  const { today } = await plannerClock();
  const start = from ?? today;
  const { data: material } = await supabase.from("materials").select("id, title").eq("id", materialId).maybeSingle();
  if (!material) throw new PlannerError("Material not found.", 404);
  const dates = [1, 3, 7, 14].map((offset) => addDays(start, offset));
  const { data: existing } = await supabase.from("study_tasks").select("scheduled_for").eq("material_id", materialId).eq("kind", "review").in("scheduled_for", dates).neq("status", "skipped");
  const taken = new Set((existing ?? []).map((row) => row.scheduled_for));
  const rows = dates
    .filter((date) => !taken.has(date))
    .map((date, index) => ({
      kind: "review" as const,
      method: "review",
      title: clampTitle(`Review: ${material.title}`),
      reason: clampText(`Day ${[1, 3, 7, 14][dates.indexOf(date)]} review (1-3-7-14) of ${material.title}.`, 400),
      scheduled_for: date,
      minutes: 10,
      material_id: materialId,
      position: 80 + index,
    }));
  if (rows.length) {
    const { error } = await supabase.from("study_tasks").insert(rows);
    if (error) throw new Error(`study_tasks: review cycle failed: ${error.message}`);
  }
  return { created: rows.length, dates };
}
