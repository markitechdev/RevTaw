import { CalendarCheck, Layers } from "lucide-react";
import Link from "next/link";

import { TaskItem } from "@/components/planner/task-item";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TEXT_LINK } from "@/components/ui/text-link";
import type { DueToday } from "@/lib/planner/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** The due-today system (§22 "Due Today", Phase 7): plan tasks, overdue tasks, due cards, fading concepts. */
export function DueTodayCard({ due, compact = false, title = "Due today" }: { due: DueToday; compact?: boolean; title?: string }) {
  const pending = due.tasks.filter((task) => task.status !== "skipped");
  const empty = pending.length === 0 && due.overdueCount === 0 && due.dueCards === 0 && due.dueConcepts.length === 0;
  const overdueShown = Math.min(due.overdue.length, compact ? 2 : 10);
  const plannedShown = Math.min(pending.length, compact ? 3 : 20);
  const percent = due.plannedMinutes > 0 ? Math.round((due.doneMinutes / due.plannedMinutes) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>
          {pending.length > 0 ? `${due.doneMinutes} of ${due.plannedMinutes} planned minutes done.` : "Spaced repetition and scheduled reviews."}
        </CardDescription>
        {pending.length > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${percent}% of today's plan done`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {empty ? (
          <EmptyState
            compact
            icon={CalendarCheck}
            title="Nothing due today"
            description="Add an exam and RevTaw schedules the work; flashcard reviews and fading concepts also land here."
            action={
              <Link href={routes.planner} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                Open Planner
              </Link>
            }
          />
        ) : (
          <>
            {due.overdue.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-danger">Overdue</h3>
                <ul className="flex flex-col gap-2">
                  {due.overdue.slice(0, overdueShown).map((task) => (
                    <TaskItem key={task.id} task={task} today={due.today} showDate compact={compact} />
                  ))}
                </ul>
                {due.overdueCount > overdueShown && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {due.overdueCount - overdueShown} more overdue from the last two weeks
                  </p>
                )}
              </div>
            )}
            {pending.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planned</h3>
                <ul className="flex flex-col gap-2">
                  {pending.slice(0, plannedShown).map((task) => (
                    <TaskItem key={task.id} task={task} today={due.today} compact={compact} />
                  ))}
                </ul>
                {pending.length > plannedShown &&
                  (compact ? (
                    <Link href={routes.planner} className={cn("mt-2 inline-block text-xs", TEXT_LINK)}>
                      {pending.length - plannedShown} more in the planner
                    </Link>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">{pending.length - plannedShown} more today, in the calendar below</p>
                  ))}
              </div>
            )}
            {(due.dueCards > 0 || due.dueConcepts.length > 0) && (
              <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                {due.dueCards > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {due.dueCards} flashcard{due.dueCards === 1 ? "" : "s"} due
                    </span>
                    <Link href={`${routes.flashcards}/review`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
                      Review
                    </Link>
                  </div>
                )}
                {due.dueConcepts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fading concepts</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {due.dueConcepts.slice(0, compact ? 4 : 8).map((concept) => (
                        <li key={concept.id}>
                          <Link href={concept.materialId ? `${routes.study}?method=active_recall&material=${concept.materialId}` : routes.study} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs hover:bg-muted" title={`Recall strength ${concept.retrieval}%`}>
                            {concept.name}
                            <span className="text-muted-foreground">{concept.retrieval}%</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
