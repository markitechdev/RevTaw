import { ArrowLeft, CalendarDays, Settings2, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AssistantPage } from "@/components/assistant/assistant-provider";
import { AddActivityButton } from "@/components/planner/activity-dialog";
import { ExamDangerActions, PlanSettings } from "@/components/planner/exam-actions";
import { ExportMenu } from "@/components/export/export-menu";
import { ExamCard } from "@/components/planner/exam-card";
import { ExamDialogButton } from "@/components/planner/exam-dialog";
import { TaskItem } from "@/components/planner/task-item";
import { Alert } from "@/components/forms/form-alert";
import { StatCard } from "@/components/dashboard/stat-card";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listMaterials, listSubjects } from "@/lib/materials/queries";
import { formatDate, WEEKDAY_LONG, weekdayOf } from "@/lib/planner/dates";
import { CRAM_NOTE } from "@/lib/planner/generate";
import { getExam, getExamTitle, getPlanIdForExam } from "@/lib/planner/queries";
import { plannerClock, rebalancePlan } from "@/lib/planner/service";
import { PLAN_MODE_LABEL } from "@/lib/planner/types";
import { getPreferences } from "@/lib/preferences/queries";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { CONFIDENCE_LABEL } from "@/lib/quizzes/types";
import { routes } from "@/lib/routes";

export async function generateMetadata({ params }: { params: Promise<{ examId: string }> }): Promise<Metadata> {
  const { examId } = await params;
  const title = await getExamTitle(examId);
  return { title: title ?? "Exam" };
}

export default async function ExamPlanPage({ params }: PageProps<"/planner/[examId]">) {
  const { examId } = await params;
  const { user, profile } = await getCurrentUserWithProfile();
  if (!user) redirect(routes.login);
  // Daily adjustment first (missed tasks, strong/weak materials), then one read of the adjusted plan.
  const planId = await getPlanIdForExam(examId);
  if (planId) await rebalancePlan(planId);
  const exam = await getExam(examId);
  if (!exam) notFound();
  const { today, timezone } = await plannerClock();
  const [materials, subjects, preferences] = await Promise.all([listMaterials(), listSubjects(), getPreferences()]);
  const readyMaterials = materials.filter((material) => material.status === "ready").map((material) => ({ id: material.id, title: material.title, subject: material.subject?.name ?? null }));
  const subjectOptions = subjects.filter((subject) => !subject.archived_at).map((subject) => ({ id: subject.id, name: subject.name }));
  const activityOptions = { materials: readyMaterials, subjects: subjectOptions, today, timezone, defaultReminder: preferences.notifications.defaultReminder };

  const visible = exam.tasks.filter((task) => task.status !== "skipped" || task.scheduled_for >= today);
  const byDay = new Map<string, typeof visible>();
  for (const task of visible) byDay.set(task.scheduled_for, [...(byDay.get(task.scheduled_for) ?? []), task]);
  const days = [...byDay.entries()];
  const pastDays = days.filter(([date]) => date < today);
  const futureDays = days.filter(([date]) => date >= today);
  const warnings = ((exam.plan?.settings as { warnings?: string[] } | null)?.warnings ?? []).filter((warning) => warning !== CRAM_NOTE);
  const totalMinutes = exam.tasks.filter((task) => task.status !== "skipped").reduce((sum, task) => sum + task.minutes, 0);

  const editButton = (
    <ExamDialogButton
      materials={readyMaterials}
      subjects={subjectOptions}
      today={today}
      defaultMinutes={profile?.preferred_session_minutes ?? null}
      examId={exam.id}
      size="sm"
      variant="secondary"
      initial={{
        title: exam.title,
        examDate: exam.exam_date,
        subjectId: exam.subject_id,
        priority: exam.priority,
        confidence: exam.confidence,
        topics: exam.topics,
        notes: exam.notes,
        materialIds: exam.materials.map((material) => material.id),
        plan: { mode: exam.plan?.mode ?? "exam", availableDays: exam.plan?.available_days ?? [0, 1, 2, 3, 4, 5, 6], minutesPerDay: exam.plan?.minutes_per_day ?? 45 },
      }}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <AssistantPage context={{ kind: "exam", id: exam.id }} label={`Planner → ${exam.title}`} materialId={exam.materials[0]?.id ?? null} />
      <Link href={routes.planner} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Planner
      </Link>

      <ExamCard
        exam={exam}
        today={today}
        headingLevel="h1"
        actions={
          <>
            {editButton}
            <ExportMenu target={{ kind: "plan", id: exam.id }} label="Export plan" />
            <ExamDangerActions examId={exam.id} archived={Boolean(exam.archived_at)} />
          </>
        }
      />

      {exam.confidence && (
        <p className="text-sm text-muted-foreground">
          Confidence when planned: {CONFIDENCE_LABEL[exam.confidence]}.{exam.topics.length > 0 ? ` Topics: ${exam.topics.join(", ")}.` : ""}
          {exam.notes ? ` ${exam.notes}` : ""}
        </p>
      )}

      {exam.plan?.mode === "cram" && <Alert tone="warning">{CRAM_NOTE}</Alert>}
      {warnings.map((warning) => (
        <Alert key={warning} tone="info">
          {warning}
        </Alert>
      ))}
      {exam.plan?.adjustment_note && (
        <Alert tone="info">
          <span className="font-medium">RevTaw adjusted the plan:</span> {exam.plan.adjustment_note}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={CalendarDays} label="Days left" value={exam.daysLeft < 0 ? "Done" : String(exam.daysLeft)} caption={exam.plan ? `${exam.plan.available_days.length} study day${exam.plan.available_days.length === 1 ? "" : "s"} a week` : "No plan yet"} />
        <StatCard icon={Sparkles} label="Plan progress" value={`${exam.tasksDone}/${exam.tasksTotal}`} caption={`${totalMinutes} planned minutes in total`} />
        <StatCard icon={Settings2} label="Daily budget" value={exam.plan ? `${exam.plan.minutes_per_day} min` : "—"} caption={exam.plan ? PLAN_MODE_LABEL[exam.plan.mode] : ""} />
        <StatCard icon={CalendarDays} label="Mastery" value={exam.averageMastery === null ? "—" : `${exam.averageMastery}%`} caption={exam.averageMastery === null ? "Answer questions on its materials" : "Average over practised concepts"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Schedule</h2>
            <AddActivityButton options={activityOptions} examId={exam.id} label="Add task" />
          </div>
          {futureDays.length === 0 && pastDays.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No tasks scheduled" description={exam.daysLeft < 0 ? "The exam has passed." : "Regenerate the plan or add tasks by hand."} />
          ) : (
            <div className="flex flex-col gap-4">
              {futureDays.map(([date, tasks]) => (
                <section key={date} aria-label={formatDate(date, today)} className={date === today ? "rounded-xl border border-primary/40 bg-primary-soft/20 p-3" : ""}>
                  <h3 className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {date === today ? "Today" : WEEKDAY_LONG[weekdayOf(date)]} · {formatDate(date, today)}
                    {date === exam.exam_date && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-warning">Exam day</span>}
                    <span className="font-normal normal-case tracking-normal">· {tasks.filter((task) => task.status !== "skipped").reduce((sum, task) => sum + task.minutes, 0)} min</span>
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {tasks.map((task) => (
                      <TaskItem key={task.id} task={task} today={today} />
                    ))}
                  </ul>
                </section>
              ))}
              {pastDays.length > 0 && (
                <details className="rounded-xl border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Earlier days ({pastDays.length}) · {pastDays.flatMap(([, tasks]) => tasks).filter((task) => task.status === "done").length} done
                  </summary>
                  <div className="mt-3 flex flex-col gap-4">
                    {pastDays.map(([date, tasks]) => (
                      <section key={date} aria-label={formatDate(date, today)}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {WEEKDAY_LONG[weekdayOf(date)]} · {formatDate(date, today)}
                        </h3>
                        <ul className="flex flex-col gap-2">
                          {tasks.map((task) => (
                            <TaskItem key={task.id} task={task} today={today} compact />
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Plan settings</CardTitle>
              <CardDescription>Change the days, the daily budget or the style and the schedule is rebuilt from today; finished tasks stay.</CardDescription>
            </CardHeader>
            <CardContent>
              {exam.plan ? (
                <PlanSettings planId={exam.plan.id} mode={exam.plan.mode} availableDays={exam.plan.available_days} minutesPerDay={exam.plan.minutes_per_day} />
              ) : (
                <p className="text-sm text-muted-foreground">Edit the exam to generate a plan.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>How the plan adapts</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Every day RevTaw moves missed tasks forward, drops a recall task for a material that is already strong, adds one for a material that is still weak, and regenerates the plan when the date or materials change. Use “Adjust now” after a big study day.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
