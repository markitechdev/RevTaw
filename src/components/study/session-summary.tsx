import { CalendarClock, CircleCheck, CircleX, Clock, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TINT } from "@/components/ui/tint";
import type { SessionSummary } from "@/lib/study/sessions";
import { cn } from "@/lib/utils";

export function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} s`;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

export function formatDue(value: string | null): string {
  if (!value) return "No review scheduled";
  const due = new Date(value);
  const diffMs = due.getTime() - Date.now();
  if (diffMs <= 0) return "Due now";
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `In ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `In ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Tomorrow";
  if (days < 30) return `In ${days} days`;
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Study session summary (§29): the same card closes every kind of session. */
export function SessionSummaryCard({
  title,
  summary,
  extraStats = [],
  actions,
  headingLevel = "h2",
}: {
  title: string;
  summary: SessionSummary;
  extraStats?: Array<{ label: string; value: string }>;
  actions?: ReactNode;
  /** h1 when the summary is the page (a finished session opened later), h2 under a runner's own heading. */
  headingLevel?: "h1" | "h2";
}) {
  const accuracy = summary.accuracy === null ? null : Math.round(summary.accuracy * 100);
  const improvement = summary.improvement === null ? null : Math.round(summary.improvement * 100);
  const stats: Array<{ label: string; value: string; icon?: typeof Clock; tone?: string }> = [
    { label: "Duration", value: formatSeconds(summary.durationSeconds), icon: Clock },
    { label: "Answered", value: String(summary.questionsAnswered) },
    { label: "Correct", value: String(summary.correct), icon: CircleCheck, tone: "text-success" },
    { label: "Incorrect", value: String(summary.incorrect), icon: CircleX, tone: "text-danger" },
    { label: "Accuracy", value: accuracy === null ? "—" : `${accuracy}%` },
    ...extraStats,
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle as={headingLevel} className="text-lg">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-muted/40 p-3">
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className={cn("mt-0.5 flex items-center gap-1.5 text-lg font-semibold tabular-nums", stat.tone)}>
                {stat.icon && <stat.icon className="h-4 w-4" aria-hidden="true" />}
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        {improvement !== null && (
          <p className={cn("flex items-center gap-1.5 text-sm", improvement >= 0 ? "text-success" : "text-danger")}>
            {improvement >= 0 ? <TrendingUp className="h-4 w-4" aria-hidden="true" /> : <TrendingDown className="h-4 w-4" aria-hidden="true" />}
            {improvement >= 0 ? "+" : ""}
            {improvement} points vs. your previous session of this kind.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Topics covered</p>
            <p className="text-sm">{summary.topics.length ? summary.topics.join(", ") : "—"}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger">Weak concepts</p>
            <p className="text-sm">{summary.weakConcepts.length ? summary.weakConcepts.join(", ") : "None this session"}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success">Strong concepts</p>
            <p className="text-sm">{summary.strongConcepts.length ? summary.strongConcepts.join(", ") : "None yet"}</p>
          </div>
        </div>

        {summary.masteredConcepts.length > 0 && (
          <p className="text-sm">
            <span className="font-medium">Mastered:</span> {summary.masteredConcepts.join(", ")}
          </p>
        )}

        <div className={`flex flex-col gap-2 rounded-lg border p-4 text-sm ${TINT.primary}`}>
          <p className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="font-medium">Suggested next:</span> {summary.suggestedNext}
            </span>
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
            Next scheduled review: {formatDue(summary.nextReviewAt)}
          </p>
        </div>

        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </CardContent>
    </Card>
  );
}
