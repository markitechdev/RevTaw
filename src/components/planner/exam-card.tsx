import { CalendarDays, Target } from "lucide-react";
import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, relativeDays } from "@/lib/planner/dates";
import type { ExamSummary } from "@/lib/planner/queries";
import { PLAN_MODE_LABEL, PRIORITY_LABEL } from "@/lib/planner/types";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

const PRIORITY_TONE: Record<ExamSummary["priority"], BadgeTone> = { low: "neutral", normal: "primary", high: "warning" };

export function readinessTone(value: number | null): string {
  if (value === null) return "bg-muted-foreground/40";
  return value >= 80 ? "bg-success" : value >= 60 ? "bg-info" : value >= 40 ? "bg-warning" : "bg-danger";
}

/** Countdown + preparation progress for one exam (§22 "Upcoming Exams"). */
export function ExamCard({ exam, today, compact = false, actions, headingLevel: Heading = "h3" }: { exam: ExamSummary; today: string; compact?: boolean; actions?: React.ReactNode; /** h1 on the exam's own page, h3 in lists under a section heading. */ headingLevel?: "h1" | "h2" | "h3" }) {
  const countdown = exam.daysLeft < 0 ? "Finished" : exam.daysLeft === 0 ? "Today" : exam.daysLeft === 1 ? "Tomorrow" : `${exam.daysLeft} days`;
  // On the exam's own page the card is the page's heading, and "Open plan" would link to itself.
  const onPage = Heading === "h1";
  return (
    <article className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4", exam.daysLeft >= 0 && exam.daysLeft <= 3 && "border-warning/50")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* The heading is the title alone; the badges sit beside it. */}
          <div className="flex flex-wrap items-center gap-2">
            <Heading className="min-w-0 font-display text-base font-semibold tracking-display wrap-anywhere">
              {onPage ? (
                exam.title
              ) : (
                <Link href={`${routes.planner}/${exam.id}`} className="hover:underline">
                  {exam.title}
                </Link>
              )}
            </Heading>
            <Badge tone={PRIORITY_TONE[exam.priority]}>{PRIORITY_LABEL[exam.priority]} priority</Badge>
            {exam.plan && <Badge tone={exam.plan.mode === "cram" ? "warning" : "neutral"}>{PLAN_MODE_LABEL[exam.plan.mode]}</Badge>}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {formatDate(exam.exam_date, today)} · {relativeDays(exam.exam_date, today)}
            </span>
            {exam.subject && <span>· {exam.subject.name}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums leading-none">{countdown}</p>
          <p className="mt-1 text-xs text-muted-foreground">{exam.daysLeft >= 0 ? "until the exam" : ""}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            Readiness {exam.readiness === null ? "—" : `${exam.readiness}%`}
          </span>
          <span>
            {exam.tasksDone}/{exam.tasksTotal} tasks · {exam.concepts ? `${exam.concepts.practiced} of ${exam.concepts.total} concepts practiced` : exam.averageMastery === null ? "no mastery data" : `${exam.averageMastery}% mastery`}
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={exam.readiness ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={`Readiness ${exam.readiness ?? 0}%`}>
          <div className={cn("h-full rounded-full", readinessTone(exam.readiness))} style={{ width: `${exam.readiness ?? 0}%` }} />
        </div>
      </div>

      {!compact && exam.materials.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {exam.materials.map((material) => (
            <li key={material.id}>
              <Link href={`${routes.materials}/${material.id}`} className="inline-block rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-muted">
                {material.title}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(!onPage || actions) && (
        <div className="flex flex-wrap items-center gap-2">
          {!onPage && (
            <Link href={`${routes.planner}/${exam.id}`} className={buttonClasses({ size: "sm", variant: compact ? "secondary" : "primary" })}>
              Open plan
            </Link>
          )}
          {actions}
        </div>
      )}
    </article>
  );
}
