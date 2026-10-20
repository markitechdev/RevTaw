import { CalendarDays, Flag, Repeat } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AddTaskButton } from "@/components/planner/custom-task-dialog";
import { DueTodayCard } from "@/components/planner/due-today";
import { ExamCard } from "@/components/planner/exam-card";
import { ExamDialogButton } from "@/components/planner/exam-dialog";
import { GoalList, NewGoalButton } from "@/components/planner/goals";
import { TaskItem } from "@/components/planner/task-item";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listMaterials, listSubjects } from "@/lib/materials/queries";
import { syncNotifications } from "@/lib/notifications/service";
import { addDays, formatDate, WEEKDAY_LONG, weekdayOf } from "@/lib/planner/dates";
import { listGoalsWithProgress } from "@/lib/planner/goals";
import { getDueToday, listExams, listTasks } from "@/lib/planner/queries";
import { plannerClock, rebalanceAllPlans } from "@/lib/planner/service";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Planner",
};

export default async function PlannerPage() {
  const { user, profile } = await getCurrentUserWithProfile();
  if (!user) redirect(routes.login);
  // Daily adjustment first so what is shown already reflects missed days and new scores.
  await rebalanceAllPlans();
  const { today, timezone } = await plannerClock();
  const [due, exams, goals, materials, subjects, upcoming] = await Promise.all([
    getDueToday(),
    listExams(),
    listGoalsWithProgress(),
    listMaterials(),
    listSubjects(),
    listTasks({ from: addDays(today, 1), to: addDays(today, 7) }),
  ]);
  await syncNotifications();
  const readyMaterials = materials.filter((material) => material.status === "ready").map((material) => ({ id: material.id, title: material.title, subject: material.subject?.name ?? null }));
  const subjectOptions = subjects.filter((subject) => !subject.archived_at).map((subject) => ({ id: subject.id, name: subject.name }));
  const upcomingByDay = new Map<string, typeof upcoming>();
  for (const task of upcoming) {
    if (task.status === "skipped") continue;
    upcomingByDay.set(task.scheduled_for, [...(upcomingByDay.get(task.scheduled_for) ?? []), task]);
  }
  const reviewCycles = upcoming.filter((task) => task.kind === "review" && task.status === "pending");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Planner"
        description={`Exam countdowns, a day-by-day plan that adjusts to how you do, scheduled reviews and goals. Today is ${formatDate(today, today)}${timezone ? ` (${timezone})` : ""}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <AddTaskButton materials={readyMaterials} today={today} />
            <ExamDialogButton materials={readyMaterials} subjects={subjectOptions} today={today} defaultMinutes={profile?.preferred_session_minutes ?? null} size="sm" />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DueTodayCard due={due} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-primary" aria-hidden="true" />
              Goals
            </CardTitle>
            <CardDescription>Measured from your sessions, reviews, answers and mastery.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {goals.length === 0 ? (
              <EmptyState compact icon={Flag} title="No goals yet" description="Study 60 minutes today, review 50 flashcards this week, reach 80% mastery of a material…" />
            ) : (
              <GoalList goals={goals} />
            )}
            <div>
              <NewGoalButton materials={readyMaterials} today={today} />
            </div>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="exams-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="exams-heading" className="text-lg font-semibold">
            Upcoming exams
          </h2>
          <p className="text-xs text-muted-foreground">Readiness blends the mastery of an exam&rsquo;s materials with how much of its plan is done.</p>
        </div>
        {exams.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No exams scheduled"
            description="Add an exam date and RevTaw paces coverage, 1-3-7-14 reviews, practice tests and a final simulation toward it — sized to the days and minutes you actually have."
            action={<ExamDialogButton materials={readyMaterials} subjects={subjectOptions} today={today} defaultMinutes={profile?.preferred_session_minutes ?? null} size="sm" />}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {exams.map((exam) => (
              <ExamCard key={exam.id} exam={exam} today={today} />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Next 7 days</CardTitle>
            <CardDescription>Every plan, review and custom task that is coming up.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingByDay.size === 0 ? (
              <EmptyState compact icon={CalendarDays} title="Nothing scheduled" description="Plans and scheduled reviews fill this in." />
            ) : (
              <div className="flex flex-col gap-4">
                {[...upcomingByDay.entries()].map(([date, tasks]) => (
                  <div key={date}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {WEEKDAY_LONG[weekdayOf(date)]} · {formatDate(date, today)} · {tasks.reduce((sum, task) => sum + task.minutes, 0)} min
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {tasks.map((task) => (
                        <TaskItem key={task.id} task={task} today={today} compact />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" aria-hidden="true" />
              Scheduled reviews
            </CardTitle>
            <CardDescription>1-3-7-14 cycles started from a material.</CardDescription>
          </CardHeader>
          <CardContent>
            {reviewCycles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Open a material and choose “Schedule 1-3-7-14 reviews” to add short recall passes on days 1, 3, 7 and 14.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {reviewCycles.slice(0, 8).map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="truncate">{task.material?.title ?? task.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(task.scheduled_for, today)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
