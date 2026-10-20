"use client";

import { Check, CircleDashed, Play, SkipForward, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { SessionHeader } from "@/components/study/session-header";
import { SessionSummaryCard } from "@/components/study/session-summary";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import type { SmartSessionView as SmartView } from "@/lib/adaptive/smart";
import { routes } from "@/lib/routes";
import { completeSmartSessionAction, skipSmartBlockAction, startSmartBlockAction } from "@/lib/study/actions";
import { methodName } from "@/lib/study/catalog";
import type { SessionDetail } from "@/lib/study/queries";
import type { SessionSummary } from "@/lib/study/sessions";
import { cn } from "@/lib/utils";

/** The smart session plan: blocks with their reasons, run one at a time, then one combined summary. */
export function SmartSessionView({ session, view, methodName: displayName = "Smart Study", routine = false }: { session: SessionDetail; view: SmartView; methodName?: string; routine?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [pending, startTransition] = useTransition();
  const [ending, setEnding] = useState(false);

  const start = (key: string) => {
    setBusy(key);
    setError(null);
    startTransition(async () => {
      const result = await startSmartBlockAction({ sessionId: session.id, key });
      if (!result.ok) {
        setError(result.message);
        setBusy(null);
        return;
      }
      router.push(result.data.redirect);
    });
  };

  const skip = (key: string) => {
    setBusy(key);
    setError(null);
    startTransition(async () => {
      const result = await skipSmartBlockAction({ sessionId: session.id, key });
      if (!result.ok) setError(result.message);
      setBusy(null);
      router.refresh();
    });
  };

  const finish = () => {
    setEnding(true);
    setError(null);
    startTransition(async () => {
      const result = await completeSmartSessionAction(session.id);
      if (!result.ok) {
        setError(result.message);
        setEnding(false);
        return;
      }
      setSummary(result.data);
      router.refresh();
    });
  };

  if (summary) {
    const blocksDone = (summary.extra as { blocksDone?: number } | undefined)?.blocksDone ?? 0;
    return (
      <SessionSummaryCard
        title={blocksDone === 0 ? `${displayName} stopped early` : `${displayName} complete`}
        summary={summary}
        extraStats={[{ label: "Blocks done", value: `${blocksDone}/${view.blocks.length}` }]}
        actions={
          <Link href={routes.study} className={buttonClasses({ size: "sm" })}>
            Back to Study
          </Link>
        }
      />
    );
  }

  const done = view.blocks.filter((block) => block.status === "done" || block.status === "skipped").length;
  const allDone = done === view.blocks.length;

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={displayName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`${done} of ${view.blocks.length} blocks`}
        onEnd={finish}
        ending={ending}
        endLabel={allDone ? "Finish & summarize" : "End early"}
      />
      {error && <Alert tone="error">{error}</Alert>}

      <div className="rounded-xl border border-primary/30 bg-primary-soft/30 p-4 text-sm">
        <p className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            {routine
              ? `Your routine has ${view.blocks.length} block${view.blocks.length === 1 ? "" : "s"} (${session.planned_minutes} minutes).`
              : `RevTaw planned ${view.blocks.length} block${view.blocks.length === 1 ? "" : "s"} for your ${session.planned_minutes} minutes from your mastery, mistakes and due reviews.`}{" "}
            Run them in order — each one is a normal session with its own summary, and this page keeps the plan.
          </span>
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        {view.blocks.map((block, index) => {
          const isNext = view.nextBlockKey === block.key;
          const accuracy = block.childSummary?.accuracy;
          return (
            <li
              key={block.key}
              className={cn(
                "flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between",
                block.status === "done" && "border-success/40",
                isNext && block.status !== "done" && "border-primary/50 shadow-sm",
                block.status === "skipped" && "opacity-70",
              )}
            >
              <div className="flex min-w-0 gap-3">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    block.status === "done" ? "bg-success-soft text-success" : isNext ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {block.status === "done" ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{methodName(block.method)}</span>
                    <Badge tone="neutral">{block.minutes} min</Badge>
                    {block.status === "in_progress" && (
                      <Badge tone="primary">
                        <CircleDashed className="h-3 w-3" aria-hidden="true" />
                        In progress
                      </Badge>
                    )}
                    {block.status === "skipped" && <Badge tone="neutral">Skipped</Badge>}
                    {block.status === "done" && accuracy !== null && accuracy !== undefined && (
                      <Badge tone={accuracy >= 0.8 ? "success" : accuracy >= 0.6 ? "warning" : "danger"}>{Math.round(accuracy * 100)}%</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{block.reason}</p>
                  {block.concepts.length > 0 && <p className="text-xs text-muted-foreground">Focus: {block.concepts.join(", ")}</p>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                {block.status === "done" && block.childSessionId && (
                  <Link href={`${routes.study}/${block.childSessionId}`} className={buttonClasses({ size: "sm", variant: "ghost" })}>
                    View summary
                  </Link>
                )}
                {(block.status === "pending" || block.status === "in_progress") && (
                  <>
                    <Button type="button" size="sm" variant={isNext ? "primary" : "secondary"} loading={busy === block.key && pending} onClick={() => start(block.key)} disabled={pending && busy !== block.key}>
                      {!(busy === block.key && pending) && <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                      {block.status === "in_progress" ? "Resume" : "Start"}
                    </Button>
                    {block.status === "pending" && (
                      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => skip(block.key)}>
                        <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                        Skip
                      </Button>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {allDone && (
        <div className="flex justify-end">
          <Button type="button" onClick={finish} loading={ending}>
            Finish &amp; summarize
          </Button>
        </div>
      )}
    </div>
  );
}
