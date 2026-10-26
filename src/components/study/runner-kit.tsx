"use client";

import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { SessionHeader } from "@/components/study/session-header";
import { SessionSummaryCard } from "@/components/study/session-summary";
import { Button, buttonClasses } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { TINT } from "@/components/ui/tint";
import { routes } from "@/lib/routes";
import { answerRecallAction, completeSessionAction } from "@/lib/study/actions";
import type { SessionDetail } from "@/lib/study/queries";
import type { RecallItemResult } from "@/lib/study/service";
import type { SessionSummary } from "@/lib/study/sessions";
import { PASS_SCORE, VERDICT_LABEL, verdictFor, type Verdict } from "@/lib/study/verdict";
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
  parentLabel = "Back to Tamari's plan",
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

/**
 * Colored result box; the verdict is spelled out so status never relies on color alone (§41). It comes from the
 * score by the same rule that decided what was stored (lib/study/verdict.ts), so "Correct" and "Mostly right"
 * are exactly the answers counted as correct. `verdict` is for exercises whose result isn't the score alone.
 */
export function VerdictBox({ score, passAt = PASS_SCORE.recall, verdict, title, scoreLabel, children }: { score: number; passAt?: number; verdict?: Verdict; title?: string; scoreLabel?: string; children?: ReactNode }) {
  const shown = verdict ?? verdictFor(score, passAt);
  const good = shown === "correct" || shown === "mostly";
  return (
    <div className={cn("rounded-lg border p-4 text-sm", good && TINT.success, shown === "partial" && TINT.warning, shown === "incorrect" && TINT.danger)} role="status">
      <p className="flex items-center gap-2 font-semibold">
        {good ? (
          <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />
        ) : shown === "partial" ? (
          <CircleDashed className="h-4 w-4 text-warning" aria-hidden="true" />
        ) : (
          <CircleX className="h-4 w-4 text-danger" aria-hidden="true" />
        )}
        {title ? `${title}: ${VERDICT_LABEL[shown]}` : VERDICT_LABEL[shown]}
        <span className="font-normal text-muted-foreground">· {Math.round(score)}%{scoreLabel ? ` ${scoreLabel}` : ""}</span>
      </p>
      {children}
    </div>
  );
}

/** Small labeled list used inside feedback panels. */
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

/** One recall question answered inline: the model answer comes back only after the student answers. */
export function RecallCard({ itemId, prompt, initial, onAnswered }: { itemId: string; prompt: string; initial?: RecallItemResult | null; onAnswered?: (result: RecallItemResult) => void }) {
  const [response, setResponse] = useState("");
  const [result, setResult] = useState<RecallItemResult | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaId = `recall-${itemId}`;

  const check = () => {
    setError(null);
    startTransition(async () => {
      const answered = await answerRecallAction({ itemId, response, confidence: null, responseMs: null });
      if (!answered.ok) {
        setError(answered.message);
        return;
      }
      setResult(answered.data);
      onAnswered?.(answered.data);
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
      <label htmlFor={textareaId} className="font-medium">
        {prompt}
      </label>
      {error && <p className="text-danger" role="alert">{error}</p>}
      {!result ? (
        <>
          <Textarea id={textareaId} rows={3} maxLength={8000} value={response} disabled={pending} onChange={(event) => setResponse(event.target.value)} placeholder="Answer from memory." />
          <div className="flex justify-end">
            <Button type="button" size="sm" loading={pending} onClick={check}>
              Check
            </Button>
          </div>
        </>
      ) : (
        <>
          <VerdictBox score={result.comparison.score}>
            <p className="mt-1">{result.comparison.feedback}</p>
          </VerdictBox>
          <p className="rounded-lg bg-success-soft/50 p-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From the material: </span>
            {result.modelAnswer}
          </p>
        </>
      )}
    </div>
  );
}
