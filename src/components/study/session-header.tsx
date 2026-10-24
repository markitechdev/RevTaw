"use client";

import { ArrowLeft, Clock, Flag } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}` : `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/** Shared study session header (§52): title, method, elapsed time vs. plan, progress, end button. */
export function SessionHeader({
  title,
  methodName,
  startedAt,
  plannedMinutes,
  progressLabel,
  onEnd,
  ending,
  endLabel = "End session",
}: {
  title: string;
  methodName: string;
  startedAt: string;
  plannedMinutes: number | null;
  progressLabel?: string;
  onEnd?: () => void;
  ending?: boolean;
  endLabel?: string;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const planned = plannedMinutes ? plannedMinutes * 60 : null;
  const over = planned !== null && elapsed > planned;

  return (
    <div className="flex flex-col gap-3">
      <Link href={routes.study} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Study
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge tone="primary">{methodName}</Badge>
          <h1 className="truncate font-display text-base font-medium tracking-display">{title}</h1>
          {progressLabel && <span className="text-sm text-muted-foreground">· {progressLabel}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-sm tabular-nums", over ? "bg-warning-soft text-warning" : "bg-muted")}
            role="timer"
            aria-label={`Elapsed ${formatClock(elapsed)}${planned ? ` of ${plannedMinutes} minutes planned` : ""}`}
          >
            <Clock className="h-4 w-4" aria-hidden="true" />
            {formatClock(elapsed)}
            {planned && <span className="text-xs text-muted-foreground">/ {plannedMinutes} min</span>}
          </span>
          {onEnd && (
            <Button type="button" size="sm" variant="secondary" onClick={onEnd} loading={ending}>
              {!ending && <Flag className="h-4 w-4" aria-hidden="true" />}
              {endLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
