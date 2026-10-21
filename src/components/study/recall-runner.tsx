"use client";

import { ArrowRight, CircleCheck, CircleDashed, CircleX, Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { SessionHeader } from "@/components/study/session-header";
import { SessionSummaryCard } from "@/components/study/session-summary";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { CONFIDENCE_LEVELS } from "@/lib/quizzes/types";
import { routes } from "@/lib/routes";
import { RETRIEVAL_FORMAT_LABEL, type RetrievalFormat } from "@/lib/study/formats";
import { answerRecallAction, completeSessionAction } from "@/lib/study/actions";
import type { SessionDetail } from "@/lib/study/queries";
import type { RecallItemResult } from "@/lib/study/service";
import type { SessionSummary } from "@/lib/study/sessions";
import type { ConfidenceLevel } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Stored = RecallItemResult;

function formatPlaceholder(format: string | null): string {
  switch (format) {
    case "fill_blank":
      return "Type the missing word or phrase.";
    case "list":
      return "List every item you remember, one per line.";
    case "process":
      return "Describe the steps in order.";
    case "example":
      return "Give a concrete example that fits.";
    case "calculation":
      return "Show the formula, the substitution and the result.";
    case "definition":
      return "State the definition as precisely as you can.";
    case "explanation":
      return "Explain the why and the how in your own words.";
    default:
      return "Write what you remember before revealing the answer. A rough answer is fine — the comparison shows the gaps.";
  }
}

/**
 * Active recall / error review runner: the answer stays hidden until the
 * student writes theirs; the comparison then shows what was right, missing
 * and wrong. Progress is saved per item, so a refresh resumes.
 */
export function RecallRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to Tamari's plan" }: { session: SessionDetail; methodName: string; parentSessionId?: string | null; parentLabel?: string }) {
  const router = useRouter();
  const items = session.items;
  const [index, setIndex] = useState(() => {
    const first = items.findIndex((item) => !item.answered_at);
    return first === -1 ? items.length : first;
  });
  const [response, setResponse] = useState("");
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [results, setResults] = useState<Record<string, Stored>>(() =>
    Object.fromEntries(
      items
        .filter((item) => item.answered_at && item.analysis)
        .map((item) => [
          item.id,
          {
            comparison: item.analysis as unknown as Stored["comparison"],
            isCorrect: Boolean(item.is_correct),
            modelAnswer: item.model_answer ?? "",
            sourceExcerpt: item.source_excerpt,
          },
        ]),
    ),
  );
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [pending, startTransition] = useTransition();
  const [ending, setEnding] = useState(false);
  const shownAt = useRef<number>(0);

  const item = items[index];
  const current = item ? results[item.id] : undefined;

  useEffect(() => {
    shownAt.current = Date.now();
  }, [item?.id]);

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

  const reveal = () => {
    if (!item) return;
    setError(null);
    startTransition(async () => {
      const result = await answerRecallAction({ itemId: item.id, response, confidence, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setResults((state) => ({ ...state, [item.id]: result.data }));
      setRevealed(item.id);
    });
  };

  const next = () => {
    setResponse("");
    setConfidence(null);
    setRevealed(null);
    if (index + 1 >= items.length) finish();
    else setIndex(index + 1);
  };

  if (summary) {
    return (
      <div className="flex flex-col gap-4">
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
              {summary.incorrect > 0 && (
                <Link href={`${routes.quiz}/mistakes`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
                  Open mistake notebook
                </Link>
              )}
            </>
          }
        />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col gap-4">
        <SessionHeader title={session.title} methodName={methodName} startedAt={session.started_at} plannedMinutes={session.planned_minutes} />
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="font-medium">Every prompt is answered.</p>
          <Button type="button" className="mt-3" loading={ending} onClick={() => finish()}>
            See summary
          </Button>
        </div>
      </div>
    );
  }

  const answered = Object.keys(results).length;
  const showing = current && revealed === item.id ? current : null;

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`${index + 1} of ${items.length}`}
        onEnd={() => finish(answered === 0)}
        ending={ending}
        endLabel={answered === 0 ? "Stop" : "End & summarize"}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="recall-prompt" className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="neutral">{item.kind === "mistake" ? "Retest" : item.format && item.format in RETRIEVAL_FORMAT_LABEL ? RETRIEVAL_FORMAT_LABEL[item.format as RetrievalFormat] : "Recall"}</Badge>
          {item.concept && <Badge tone="primary">{item.concept.name}</Badge>}
          {item.material && <Badge tone="warning">{item.material.title}</Badge>}
          <span className="text-muted-foreground">
            {answered} answered · {items.length - answered} left
          </span>
        </div>
        <h2 id="recall-prompt" className="whitespace-pre-wrap text-lg font-medium leading-snug">
          {item.prompt}
        </h2>

        {!showing ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="recall-answer" className="text-sm font-medium">
                Your answer from memory
              </label>
              <Textarea
                id="recall-answer"
                rows={5}
                maxLength={8000}
                value={response}
                disabled={pending}
                placeholder={formatPlaceholder(item.format)}
                onChange={(event) => setResponse(event.target.value)}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">How sure are you?</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Confidence">
                {CONFIDENCE_LEVELS.map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    disabled={pending}
                    aria-pressed={confidence === level.id}
                    onClick={() => setConfidence((value) => (value === level.id ? null : level.id))}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      confidence === level.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={reveal}>
                I don&apos;t know — show me
              </Button>
              <Button type="button" size="sm" loading={pending} onClick={reveal} disabled={!response.trim() && false}>
                {!pending && <Eye className="h-4 w-4" aria-hidden="true" />}
                Reveal &amp; compare
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div
              className={cn(
                "rounded-lg border p-4 text-sm",
                showing.comparison.verdict === "correct" && "border-success/40 bg-success-soft/60",
                showing.comparison.verdict === "partial" && "border-warning/40 bg-warning-soft/50",
                showing.comparison.verdict === "incorrect" && "border-danger/40 bg-danger-soft/60",
              )}
              role="status"
            >
              <p className="flex items-center gap-2 font-semibold">
                {showing.comparison.verdict === "correct" ? (
                  <>
                    <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" /> Correct
                  </>
                ) : showing.comparison.verdict === "partial" ? (
                  <>
                    <CircleDashed className="h-4 w-4 text-warning" aria-hidden="true" /> Partly there
                  </>
                ) : (
                  <>
                    <CircleX className="h-4 w-4 text-danger" aria-hidden="true" /> Not yet
                  </>
                )}
                <span className="font-normal text-muted-foreground">· {Math.round(showing.comparison.score)}%</span>
              </p>
              <p className="mt-2">{showing.comparison.feedback}</p>
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/60 p-3 text-sm">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your answer</dt>
                <dd className="mt-1 whitespace-pre-wrap">{response.trim() || (item.response ?? "") || <span className="text-muted-foreground">No answer</span>}</dd>
              </div>
              <div className="rounded-lg bg-success-soft/50 p-3 text-sm">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Model answer</dt>
                <dd className="mt-1 whitespace-pre-wrap">{showing.modelAnswer}</dd>
              </div>
            </dl>

            {(showing.comparison.correct_points.length > 0 || showing.comparison.missing_points.length > 0 || showing.comparison.incorrect_points.length > 0) && (
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success">You covered</p>
                  <ul className="list-disc pl-4">{showing.comparison.correct_points.length ? showing.comparison.correct_points.map((point) => <li key={point}>{point}</li>) : <li className="list-none text-muted-foreground">—</li>}</ul>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">Missing</p>
                  <ul className="list-disc pl-4">{showing.comparison.missing_points.length ? showing.comparison.missing_points.map((point) => <li key={point}>{point}</li>) : <li className="list-none text-muted-foreground">Nothing</li>}</ul>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger">Incorrect</p>
                  <ul className="list-disc pl-4">{showing.comparison.incorrect_points.length ? showing.comparison.incorrect_points.map((point) => <li key={point}>{point}</li>) : <li className="list-none text-muted-foreground">Nothing</li>}</ul>
                </div>
              </div>
            )}
            {showing.sourceExcerpt && <p className="border-l-2 border-primary/40 pl-3 text-xs italic text-muted-foreground">Source: “{showing.sourceExcerpt}”</p>}
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" size="sm" onClick={next} loading={ending}>
                {index + 1 >= items.length ? "Finish session" : "Next prompt"}
                {!ending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
