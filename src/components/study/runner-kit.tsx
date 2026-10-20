"use client";

import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { SessionHeader } from "@/components/study/session-header";
import { SessionSummaryCard } from "@/components/study/session-summary";
import { Button, buttonClasses } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { completeSessionAction } from "@/lib/study/actions";
import type { SessionDetail } from "@/lib/study/queries";
import type { SessionSummary } from "@/lib/study/sessions";
import { cn } from "@/lib/utils";

/**
 * Shared pieces of the item-based session runners (§52): finishing a session,
 * the closing summary with its links, the "all done" state and the verdict box.
 */

export type RunnerProps = { session: SessionDetail; methodName: string; parentSessionId?: string | null; parentLabel?: string };

export function useSessionCompletion(session: SessionDetail) {
  const router = useRouter();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const finish = (abandoned = false) => {
    setEnding(true);
    startTransition(async () => {
      const result = await completeSessionAction({ sessionId: session.id, focusSeconds: Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000), abandoned });
      if (!result.ok) {
        setError(result.message);
        setEnding(false);
        return;
      }
      setStoppedEarly(abandoned);
      setSummary(result.data);
      router.refresh();
    });
  };

  return { summary, stoppedEarly, ending, error, setError, finish, pending, startTransition };
}

export function RunnerSummary({
  methodName,
  summary,
  stoppedEarly = false,
  parentSessionId = null,
  parentLabel = "Back to smart session",
  extraStats,
  extraActions,
}: {
  methodName: string;
  summary: SessionSummary;
  /** Matches the server-rendered title after the refresh ("stopped early" for an abandoned session). */
  stoppedEarly?: boolean;
  parentSessionId?: string | null;
  parentLabel?: string;
  extraStats?: Array<{ label: string; value: string }>;
  extraActions?: ReactNode;
}) {
  return (
    <SessionSummaryCard
      title={stoppedEarly ? `${methodName} stopped early` : `${methodName} complete`}
      summary={summary}
      extraStats={extraStats}
      actions={
        <>
          {parentSessionId && (
            <Link href={`${routes.study}/${parentSessionId}`} className={buttonClasses({ size: "sm" })}>
              {parentLabel}
            </Link>
          )}
          <Link href={routes.study} className={buttonClasses({ size: "sm", variant: parentSessionId ? "secondary" : "primary" })}>
            Back to Study
          </Link>
          {summary.incorrect > 0 && (
            <Link href={`${routes.quiz}/mistakes`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
              Open mistake notebook
            </Link>
          )}
          {extraActions}
        </>
      }
    />
  );
}

export function RunnerDone({ session, methodName, message, ending, onFinish }: { session: SessionDetail; methodName: string; message: string; ending: boolean; onFinish: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <SessionHeader title={session.title} methodName={methodName} startedAt={session.started_at} plannedMinutes={session.planned_minutes} />
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="font-medium">{message}</p>
        <Button type="button" className="mt-3" loading={ending} onClick={onFinish}>
          See summary
        </Button>
      </div>
    </div>
  );
}

export type Verdict = "correct" | "partial" | "incorrect";

export function verdictOf(score: number): Verdict {
  return score >= 80 ? "correct" : score >= 40 ? "partial" : "incorrect";
}

/** Coloured result box; the verdict is spelled out so status never relies on colour alone (§41). */
export function VerdictBox({ verdict, score, children }: { verdict: Verdict; score: number; children?: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 text-sm",
        verdict === "correct" && "border-success/40 bg-success-soft/60",
        verdict === "partial" && "border-warning/40 bg-warning-soft/50",
        verdict === "incorrect" && "border-danger/40 bg-danger-soft/60",
      )}
      role="status"
    >
      <p className="flex items-center gap-2 font-semibold">
        {verdict === "correct" ? (
          <>
            <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" /> Correct
          </>
        ) : verdict === "partial" ? (
          <>
            <CircleDashed className="h-4 w-4 text-warning" aria-hidden="true" /> Partly there
          </>
        ) : (
          <>
            <CircleX className="h-4 w-4 text-danger" aria-hidden="true" /> Not yet
          </>
        )}
        <span className="font-normal text-muted-foreground">· {Math.round(score)}%</span>
      </p>
      {children}
    </div>
  );
}

/** Small labelled list used inside feedback panels. */
export function PointList({ title, items, tone = "neutral" }: { title: string; items: string[]; tone?: "neutral" | "success" | "danger" | "warning" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={cn("text-xs font-semibold uppercase tracking-wide", tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-muted-foreground")}>{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}
