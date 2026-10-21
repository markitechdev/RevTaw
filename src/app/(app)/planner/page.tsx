import { CalendarDays, Flag, Repeat } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AddActivityButton } from "@/components/planner/activity-dialog";
import { DueTodayCard } from "@/components/planner/due-today";
import { ExamCard } from "@/components/planner/exam-card";
import { ExamDialogButton } from "@/components/planner/exam-dialog";
import { GoalList, NewGoalButton } from "@/components/planner/goals";
import { PlannerCalendar } from "@/components/planner/planner-calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listMaterials, listSubjects } from "@/lib/materials/queries";
import { syncNotifications } from "@/lib/notifications/service";
import { monthGrid } from "@/lib/planner/calendar";
import { formatDate, isIsoDate } from "@/lib/planner/dates";
import { listGoalsWithProgress } from "@/lib/planner/goals";
import { getDueToday, listCalendar, listExams, listReviewCycles } from "@/lib/planner/queries";
import { plannerClock, rebalanceAllPlans } from "@/lib/planner/service";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Planner",
};

export default async function PlannerPage({ searchParams }: PageProps<"/planner">) {
  const params = await searchParams;
  const { user, profile } = await getCurrentUserWithProfile();
  if (!user) redirect(routes.login);
  // Daily adjustment first so what is shown already reflects missed days and new scores.
  await rebalanceAllPlans();
  const { today, timezone } = await plannerClock();
  // The calendar shows the month of ?date (a reminder links there), or ?month, or this month.
  const date = typeof params.date === "string" && isIsoDate(params.date) ? params.date : null;
  const month = date ? date.slice(0, 7) : typeof params.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : today.slice(0, 7);
  const selected = date ?? (month === today.slice(0, 7) ? today : `${month}-01`);
  const grid = monthGrid(month);
  // The notification sync shares these reads (cached per request) and only writes to the bell.
  const [due, exams, goals, materials, subjects, calendar, reviewCycles] = await Promise.all([
    getDueToday(),
    listExams(),
    listGoalsWithProgress(),
    listMaterials(),
    listSubjects(),
    listCalendar({ from: grid[0][0], to: grid[grid.length - 1][6] }),
    listReviewCycles(today),
    syncNotifications(),
  ]);
  const readyMaterials = materials.filter((material) => material.status === "ready").map((material) => ({ id: material.id, title: material.title, subject: material.subject?.name ?? null }));
  const subjectOptions = subjects.filter((subject) => !subject.archived_at).map((subject) => ({ id: subject.id, name: subject.name }));
  const activityOptions = { materials: readyMaterials, subjects: subjectOptions, today };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Planner"
        description={`Your calendar, exam countdowns, a day-by-day plan that adjusts to how you do, reviews and goals. Today is ${formatDate(today, today)}${timezone ? ` (${timezone})` : ""}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <AddActivityButton options={activityOptions} date={selected >= today ? selected : today} variant="primary" />
            <ExamDialogButton materials={readyMaterials} subjects={subjectOptions} today={today} defaultMinutes={profile?.preferred_session_minutes ?? null} size="sm" variant="secondary" defaultOpen={params.exam === "new"} />
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

      <Card>
        <CardContent className="pt-5">
          <PlannerCalendar key={month} month={month} selected={selected} today={today} tasks={calendar.tasks} exams={calendar.exams} options={activityOptions} />
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" aria-hidden="true" />
            Scheduled reviews
          </CardTitle>
          <CardDescription>1-3-7-14 cycles started from a material. They are on the calendar too.</CardDescription>
        </CardHeader>
        <CardContent>
          {reviewCycles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Open a material and choose “Schedule 1-3-7-14 reviews” to add short recall passes on days 1, 3, 7 and 14.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2">
              {reviewCycles.slice(0, 8).map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 border-b border-border py-2">
                  <span className="truncate">{task.material?.title ?? task.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(task.scheduled_for, today)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
