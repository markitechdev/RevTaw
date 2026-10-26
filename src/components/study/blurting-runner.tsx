"use client";

import { ArrowRight, EyeOff, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { VerdictBox } from "@/components/study/runner-kit";
import { SessionHeader } from "@/components/study/session-header";
import { SessionSummaryCard } from "@/components/study/session-summary";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { routes } from "@/lib/routes";
import { compareBlurtAction, completeSessionAction } from "@/lib/study/actions";
import type { BlurtResult } from "@/lib/study/advanced";
import type { SessionDetail } from "@/lib/study/queries";
import type { SessionSummary } from "@/lib/study/sessions";
import { PASS_SCORE } from "@/lib/study/verdict";

type Round = BlurtResult["analysis"] & { round: number };

function storedRounds(item: SessionDetail["items"][number]): Round[] {
  return ((item.analysis as { rounds?: Round[] } | null)?.rounds ?? []) as Round[];
}

/**
 * Blurting: the section's notes stay hidden while the student writes
 * everything they remember; the comparison lists remembered, missing,
 * incorrect and forgotten-important ideas. One retry, then the source.
 */
export function BlurtingRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to Tamari's plan" }: { session: SessionDetail; methodName: string; parentSessionId?: string | null; parentLabel?: string }) {
  const router = useRouter();
  const items = session.items;
  const [index, setIndex] = useState(() => {
    const first = items.findIndex((item) => !item.answered_at);
    return first === -1 ? items.length : first;
  });
  const item = items[index];
  const [text, setText] = useState(() => item?.response ?? "");
  const [rounds, setRounds] = useState<Round[]>(() => (item ? storedRounds(item) : []));
  const [source, setSource] = useState<string | null>(() => (item?.answered_at ? item.model_answer : null));
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [pending, startTransition] = useTransition();
  const [ending, setEnding] = useState(false);
  const shownAt = useRef<number>(0);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [item?.id, rounds.length]);

  const finish = (abandoned = false) => {
    setEnding(true);
    startTransition(async () => {
      const result = await completeSessionAction({ sessionId: session.id, focusSeconds: Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000), abandoned });
      if (!result.ok) {
        setError(result.message);
        setEnding(false);
        return;
      }
      setSummary(result.data);
      router.refresh();
    });
  };

  const compare = () => {
    if (!item) return;
    setError(null);
    startTransition(async () => {
      const result = await compareBlurtAction({ itemId: item.id, text, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRounds((state) => [...state, { ...result.data.analysis, round: result.data.round }]);
      if (result.data.final) setSource(result.data.source);
    });
  };

  const next = () => {
    const nextIndex = index + 1;
    setRounds(nextIndex < items.length ? storedRounds(items[nextIndex]) : []);
    setText(nextIndex < items.length ? (items[nextIndex].response ?? "") : "");
    setSource(null);
    if (nextIndex >= items.length) finish();
    else setIndex(nextIndex);
  };

  if (summary) {
    return (
      <SessionSummaryCard
        title={`${methodName} complete`}
        summary={summary}
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
          </>
        }
      />
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col gap-4">
        <SessionHeader title={session.title} methodName={methodName} startedAt={session.started_at} plannedMinutes={session.planned_minutes} />
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="font-medium">Every section is blurted.</p>
          <Button type="button" className="mt-3" loading={ending} onClick={() => finish()}>
            See summary
          </Button>
        </div>
      </div>
    );
  }

  const latest = rounds[rounds.length - 1];
  const done = items.filter((entry) => entry.answered_at).length;
  const canRetry = latest && !source;

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`section ${index + 1} of ${items.length}`}
        onEnd={() => finish(done === 0)}
        ending={ending}
        endLabel={done === 0 ? "Stop" : "End & summarize"}
      />
      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="blurt-topic" className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="neutral">
            <EyeOff className="h-3 w-3" aria-hidden="true" />
            Notes hidden
          </Badge>
          <Badge tone="primary">Attempt {Math.max(1, Math.min(2, rounds.length + (source ? 0 : 1)))} of 2</Badge>
          {item.concept && <Badge tone="neutral">{item.concept.name}</Badge>}
        </div>
        <h2 id="blurt-topic" className="font-display tracking-display text-lg font-medium leading-snug">
          Topic: <span className="text-primary">{item.prompt}</span>
        </h2>
        <p className="text-sm text-muted-foreground">Write everything you remember about this section — definitions, steps, examples, numbers. Order and polish do not matter; coverage does.</p>

        {latest && (
          <VerdictBox score={latest.score} passAt={PASS_SCORE.blurt} title={`Attempt ${latest.round}`} scoreLabel="remembered">
            <p className="mt-1">{latest.feedback}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success">Correctly remembered</p>
                <ul className="list-disc pl-4">{latest.remembered.length ? latest.remembered.map((point) => <li key={point}>{point}</li>) : <li className="list-none text-muted-foreground">Nothing yet</li>}</ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">Missing</p>
                <ul className="list-disc pl-4">{latest.missing.length ? latest.missing.map((point) => <li key={point}>{point}</li>) : <li className="list-none text-muted-foreground">Nothing</li>}</ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger">Incorrect</p>
                <ul className="list-disc pl-4">{latest.incorrect.length ? latest.incorrect.map((point) => <li key={point}>{point}</li>) : <li className="list-none text-muted-foreground">Nothing</li>}</ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger">Forgotten important concepts</p>
                <ul className="list-disc pl-4">{latest.forgotten_important.length ? latest.forgotten_important.map((point) => <li key={point}>{point}</li>) : <li className="list-none text-muted-foreground">None</li>}</ul>
              </div>
            </div>
          </VerdictBox>
        )}

        {!source ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="blurt-text" className="text-sm font-medium">
                {canRetry ? "Add what you missed and try again" : "Everything you remember"}
              </label>
              <Textarea id="blurt-text" rows={10} maxLength={8000} value={text} disabled={pending} placeholder="Start with the main idea, then every detail that comes back…" onChange={(event) => setText(event.target.value)} />
              <p className="text-xs text-muted-foreground">{text.length}/8000 characters</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" size="sm" loading={pending} onClick={compare} disabled={!text.trim()}>
                {!pending && (canRetry ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />)}
                {canRetry ? "Compare again" : "Compare with the source"}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-primary-soft/50 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">The source section</p>
              <p className="mt-1 whitespace-pre-wrap">{source}</p>
            </div>
            <div className="rounded-lg bg-muted/60 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your final blurt</p>
              <p className="mt-1 whitespace-pre-wrap">{text}</p>
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" size="sm" onClick={next} loading={ending}>
                {index + 1 >= items.length ? "Finish session" : "Next section"}
                {!ending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
