"use client";

import { BellRing, Check, Clock, Flag, Pencil, Play, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { completeTaskAction, deleteTaskAction, reopenTaskAction, skipTaskAction, startTaskAction } from "@/lib/planner/actions";
import { relativeDays } from "@/lib/planner/dates";
import type { TaskView } from "@/lib/planner/queries";
import { formatClock } from "@/lib/planner/time";
import { ACTIVITY_CATEGORY_LABEL, categoryOf, TASK_STATUS_LABEL } from "@/lib/planner/types";
import { reminderLabel } from "@/lib/reminders/time";
import { routes } from "@/lib/routes";
import { STUDY_METHOD_BY_ID, type StudyMethodId } from "@/lib/study/methods";
import type { TaskStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<TaskStatus, BadgeTone> = { pending: "neutral", done: "success", skipped: "neutral", missed: "danger" };

export function methodLabel(method: string): string {
  if (method === "review") return "Scheduled review";
  if (method === "activity") return "Activity";
  return STUDY_METHOD_BY_ID[method as StudyMethodId]?.name ?? method;
}

/** One planner task or calendar activity with Start / Done / Skip controls (§30, §53 persistence through the session link). */
export function TaskItem({
  task,
  today,
  showDate = false,
  compact = false,
  stacked = false,
  onEdit,
}: {
  task: TaskView;
  today: string;
  showDate?: boolean;
  compact?: boolean;
  /** Buttons under the text instead of beside it (narrow columns such as the calendar's day panel). */
  stacked?: boolean;
  onEdit?: (task: TaskView) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionable = task.status === "pending" || task.status === "missed";
  const startable = task.method !== "activity";
  const category = categoryOf(task);
  // Only a reminder that is still to come is worth showing.
  const reminder = (task.reminders ?? []).find((row) => row.status === "pending");

  const run = (name: string, action: () => Promise<{ ok: boolean; message?: string; data?: { redirect?: string } }>) => {
    setBusy(name);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? "Something went wrong.");
      else if (result.data?.redirect) {
        router.push(result.data.redirect);
        return;
      } else router.refresh();
      setBusy(null);
    });
  };

  return (
    <li className={cn("flex flex-col gap-2 rounded-lg border border-border bg-card p-3", !stacked && "sm:flex-row sm:items-start sm:justify-between", task.status === "done" && "opacity-75", task.status === "skipped" && "opacity-60")}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {task.starts_at && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground tabular-nums">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {formatClock(task.starts_at)}
            </span>
          )}
          <span className={cn("font-medium", task.status === "done" && "line-through decoration-muted-foreground/60")}>{task.title}</span>
          {task.kind === "custom" && task.category && task.category !== "study" ? <Badge tone="neutral">{ACTIVITY_CATEGORY_LABEL[category]}</Badge> : <Badge tone="primary">{methodLabel(task.method)}</Badge>}
          <Badge tone="neutral">{task.minutes} min</Badge>
          {task.priority === "high" && (
            <Badge tone="warning">
              <Flag className="h-3 w-3" aria-hidden="true" />
              High priority
            </Badge>
          )}
          {reminder && task.status === "pending" && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={`Reminder: ${reminderLabel(task.reminder, task.reminder_minutes)}`}>
              <BellRing className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span className="sr-only">Reminder:</span> {reminderLabel(task.reminder, task.reminder_minutes)}
            </span>
          )}
          {task.status !== "pending" && <Badge tone={STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>}
          {showDate && (
            <span className="text-xs text-muted-foreground">
              {relativeDays(task.scheduled_for, today)}
            </span>
          )}
        </div>
        {!compact && task.reason && task.reason !== "Added by you." && <p className="text-sm text-muted-foreground">{task.reason}</p>}
        {task.notes && <p className="text-sm text-muted-foreground">{task.notes}</p>}
        {!compact && (task.material || task.exam || task.subject || task.concepts.length > 0) && (
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {task.subject && <span>{task.subject.name}</span>}
            {task.material && (
              <Link href={`${routes.materials}/${task.material.id}`} className="hover:underline">
                {task.material.title}
              </Link>
            )}
            {task.exam && (
              <Link href={`${routes.planner}/${task.exam.id}`} className="hover:underline">
                {task.exam.title}
              </Link>
            )}
            {task.concepts.length > 0 && <span>Focus: {task.concepts.slice(0, 4).join(", ")}</span>}
          </p>
        )}
        {task.status === "done" && task.session_id && (
          <Link href={`${routes.study}/${task.session_id}`} className="text-xs text-primary hover:underline">
            View session summary
          </Link>
        )}
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className={cn("flex shrink-0 flex-wrap gap-1.5", !stacked && "sm:justify-end")}>
        {actionable && (
          <>
            {startable && (
              <Button type="button" size="sm" loading={busy === "start" && pending} disabled={pending && busy !== "start"} onClick={() => run("start", () => startTaskAction(task.id))}>
                {!(busy === "start" && pending) && <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                {task.session_id ? "Resume" : "Start"}
              </Button>
            )}
            <Button type="button" size="sm" variant="secondary" aria-label="Mark done" title="Mark done" loading={busy === "done" && pending} disabled={pending && busy !== "done"} onClick={() => run("done", () => completeTaskAction(task.id))}>
              {!(busy === "done" && pending) && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              Done
            </Button>
            <Button type="button" size="sm" variant="ghost" aria-label="Skip task" title="Skip" loading={busy === "skip" && pending} disabled={pending && busy !== "skip"} onClick={() => run("skip", () => skipTaskAction(task.id))}>
              {!(busy === "skip" && pending) && <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />}
            </Button>
          </>
        )}
        {(task.status === "done" || task.status === "skipped") && (
          <Button type="button" size="sm" variant="ghost" loading={busy === "reopen" && pending} disabled={pending && busy !== "reopen"} onClick={() => run("reopen", () => reopenTaskAction(task.id))}>
            {!(busy === "reopen" && pending) && <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
            Reopen
          </Button>
        )}
        {onEdit && task.kind === "custom" && (
          <Button type="button" size="sm" variant="ghost" aria-label={`Edit ${task.title}`} title="Edit" disabled={pending} onClick={() => onEdit(task)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        {task.kind !== "plan" && (
          <Button type="button" size="sm" variant="ghost" aria-label="Delete task" title="Delete" loading={busy === "delete" && pending} disabled={pending && busy !== "delete"} onClick={() => run("delete", () => deleteTaskAction(task.id))}>
            {!(busy === "delete" && pending) && <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
          </Button>
        )}
      </div>
    </li>
  );
}
