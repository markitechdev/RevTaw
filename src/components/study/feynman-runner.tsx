"use client";

import { ArrowRight, GraduationCap, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { SessionHeader } from "@/components/study/session-header";
import { SessionSummaryCard } from "@/components/study/session-summary";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { routes } from "@/lib/routes";
import { analyzeFeynmanAction, completeSessionAction } from "@/lib/study/actions";
import type { SessionDetail } from "@/lib/study/queries";
import type { FeynmanRoundResult } from "@/lib/study/service";
import type { SessionSummary } from "@/lib/study/sessions";
import { cn } from "@/lib/utils";

type RoundRecord = { round: number } & FeynmanRoundResult["analysis"];

function storedRounds(item: SessionDetail["items"][number]): RoundRecord[] {
  const analysis = item.analysis as { rounds?: RoundRecord[] } | null;
  return analysis?.rounds ?? [];
}

/**
 * Feynman runner: explain a concept for a beginner, get an analysis
 * (correct / missing / incorrect / too complex), improve it once, and only
 * then see the ideal explanation.
 */
export function FeynmanRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to smart session" }: { session: SessionDetail; methodName: string; parentSessionId?: string | null; parentLabel?: string }) {
  const router = useRouter();
  const items = session.items;
  const [index, setIndex] = useState(() => {
    const first = items.findIndex((item) => !item.answered_at);
    return first === -1 ? items.length : first;
  });
  const item = items[index];
  const [explanation, setExplanation] = useState(() => item?.response ?? "");
  const [rounds, setRounds] = useState<RoundRecord[]>(() => (item ? storedRounds(item) : []));
  const [finalResult, setFinalResult] = useState<FeynmanRoundResult | null>(null);
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

  const analyze = () => {
    if (!item) return;
    setError(null);
    startTransition(async () => {
      const result = await analyzeFeynmanAction({ itemId: item.id, explanation, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRounds((state) => [...state, { round: result.data.round, ...result.data.analysis }]);
      if (result.data.final) setFinalResult(result.data);
    });
  };

  const next = () => {
    const nextIndex = index + 1;
    setFinalResult(null);
    setRounds(nextIndex < items.length ? storedRounds(items[nextIndex]) : []);
    setExplanation(nextIndex < items.length ? (items[nextIndex].response ?? "") : "");
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
          <p className="font-medium">Every concept is explained.</p>
          <Button type="button" className="mt-3" loading={ending} onClick={() => finish()}>
            See summary
          </Button>
        </div>
      </div>
    );
  }

  const latest = rounds[rounds.length - 1];
  const done = items.filter((entry) => entry.answered_at).length;
  const awaitingImprovement = latest && !finalResult && rounds.length < 2;

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`concept ${index + 1} of ${items.length}`}
        onEnd={() => finish(done === 0)}
        ending={ending}
        endLabel={done === 0 ? "Stop" : "End & summarize"}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="feynman-concept" className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="primary">
            <GraduationCap className="h-3 w-3" aria-hidden="true" />
            Attempt {Math.min(2, rounds.length + (finalResult ? 0 : 1))} of 2
          </Badge>
          {item.concept && <Badge tone="neutral">{item.concept.name}</Badge>}
        </div>
        <h2 id="feynman-concept" className="text-lg font-medium leading-snug">
          Explain <span className="text-primary">{item.prompt}</span> as if you were teaching a beginner.
        </h2>
        <p className="text-sm text-muted-foreground">
          Use plain words, say what it is for and how it works, and give one example from the material if you can. The ideal explanation is shown after your second attempt.
        </p>

        {latest && (
          <div className={cn("rounded-lg border p-4 text-sm", latest.score >= 70 ? "border-success/40 bg-success-soft/50" : "border-warning/40 bg-warning-soft/40")} role="status">
            <p className="font-semibold">
              Attempt {latest.round}: {Math.round(latest.score)}%
            </p>
            <p className="mt-1">{latest.feedback}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success">Correct ideas</p>
                <ul className="list-disc pl-4">{latest.correct_concepts.length ? latest.correct_concepts.map((point) => <li key={point}>{point}</li>) : <li className="list-none text-muted-foreground">None yet</li>}</ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">Missing</p>
                <ul className="list-disc pl-4">{latest.missing_concepts.length ? latest.missing_concepts.map((point) => <li key={point}>{point}</li>) : <li className="list-none text-muted-foreground">Nothing</li>}</ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger">Incorrect ideas</p>
                <ul className="list-disc pl-4">{latest.incorrect_ideas.length ? latest.incorrect_ideas.map((point) => <li key={point}>{point}</li>) : <li className="list-none text-muted-foreground">Nothing</li>}</ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unnecessary complexity</p>
                <ul className="list-disc pl-4">{latest.unnecessary_complexity.length ? latest.unnecessary_complexity.map((point) => <li key={point}>{point}</li>) : <li className="list-none text-muted-foreground">Nothing</li>}</ul>
              </div>
            </div>
            {awaitingImprovement && (
              <p className="mt-3 flex items-start gap-2 font-medium">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Improve it: {latest.improve_prompt}
              </p>
            )}
          </div>
        )}

        {!finalResult ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="feynman-explanation" className="text-sm font-medium">
                {latest ? "Your improved explanation" : "Your explanation"}
              </label>
              <Textarea
                id="feynman-explanation"
                rows={8}
                maxLength={8000}
                value={explanation}
                disabled={pending}
                placeholder="Imagine a classmate who has never heard of this. Start with what it is, then how it works, then why it matters."
                onChange={(event) => setExplanation(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{explanation.length}/8000 characters</p>
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" size="sm" loading={pending} onClick={analyze} disabled={!explanation.trim()}>
                {!pending && <Sparkles className="h-4 w-4" aria-hidden="true" />}
                {latest ? "Analyze improved explanation" : "Analyze my explanation"}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-primary-soft/50 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Ideal explanation</p>
              <p className="mt-1 whitespace-pre-wrap">{finalResult.idealExplanation}</p>
              {finalResult.sourceExcerpt && <p className="mt-2 border-l-2 border-primary/40 pl-3 text-xs italic text-muted-foreground">Source: “{finalResult.sourceExcerpt}”</p>}
            </div>
            <div className="rounded-lg bg-muted/60 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your final explanation</p>
              <p className="mt-1 whitespace-pre-wrap">{explanation}</p>
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" size="sm" onClick={next} loading={ending}>
                {index + 1 >= items.length ? "Finish session" : "Next concept"}
                {!ending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
