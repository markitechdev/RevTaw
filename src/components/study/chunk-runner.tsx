"use client";

import { ArrowRight, BookOpen, Eye } from "lucide-react";
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
import { answerRecallAction, completeSessionAction } from "@/lib/study/actions";
import type { SessionDetail } from "@/lib/study/queries";
import type { RecallItemResult } from "@/lib/study/service";
import type { SessionSummary } from "@/lib/study/sessions";
import { PASS_SCORE } from "@/lib/study/verdict";

type ChunkText = { title: string; main_idea: string; details: string[]; mini_summary: string };

function chunkOf(item: SessionDetail["items"][number]): ChunkText {
  const stored = (item.analysis as { chunk?: ChunkText } | null)?.chunk;
  return stored ?? { title: item.concept?.name ?? "Section", main_idea: item.source_excerpt ?? "", details: [], mini_summary: item.source_excerpt ?? "" };
}

/**
 * Chunking: one manageable section at a time — main idea, important details,
 * mini summary — then its recall question before the next chunk unlocks.
 */
export function ChunkRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to Tamari's plan" }: { session: SessionDetail; methodName: string; parentSessionId?: string | null; parentLabel?: string }) {
  const router = useRouter();
  const items = session.items;
  const [index, setIndex] = useState(() => {
    const first = items.findIndex((item) => !item.answered_at);
    return first === -1 ? items.length : first;
  });
  const [phase, setPhase] = useState<"read" | "recall">("read");
  const [response, setResponse] = useState("");
  const [result, setResult] = useState<RecallItemResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [pending, startTransition] = useTransition();
  const [ending, setEnding] = useState(false);
  const shownAt = useRef<number>(0);
  const item = items[index];

  useEffect(() => {
    shownAt.current = Date.now();
  }, [item?.id, phase]);

  const finish = (abandoned = false) => {
    setEnding(true);
    startTransition(async () => {
      const done = await completeSessionAction({ sessionId: session.id, focusSeconds: Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000), abandoned });
      if (!done.ok) {
        setError(done.message);
        setEnding(false);
        return;
      }
      setSummary(done.data);
      router.refresh();
    });
  };

  const check = () => {
    if (!item) return;
    setError(null);
    startTransition(async () => {
      const answered = await answerRecallAction({ itemId: item.id, response, confidence: null, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
      if (!answered.ok) {
        setError(answered.message);
        return;
      }
      setResult(answered.data);
    });
  };

  const next = () => {
    setResponse("");
    setResult(null);
    setPhase("read");
    if (index + 1 >= items.length) finish();
    else setIndex(index + 1);
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
          <p className="font-medium">Every chunk is done.</p>
          <Button type="button" className="mt-3" loading={ending} onClick={() => finish()}>
            See summary
          </Button>
        </div>
      </div>
    );
  }

  const chunk = chunkOf(item);
  const done = items.filter((entry) => entry.answered_at).length;

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`chunk ${index + 1} of ${items.length}`}
        onEnd={() => finish(done === 0)}
        ending={ending}
        endLabel={done === 0 ? "Stop" : "End & summarize"}
      />
      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="chunk-title" className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="neutral">
            <BookOpen className="h-3 w-3" aria-hidden="true" />
            {phase === "read" ? "Read" : "Recall"}
          </Badge>
          {item.concept && <Badge tone="primary">{item.concept.name}</Badge>}
        </div>
        <h2 id="chunk-title" className="font-display tracking-display text-lg font-medium leading-snug">
          {chunk.title}
        </h2>

        {phase === "read" ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-primary-soft/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Main idea</p>
              <p className="mt-1 text-reading">{chunk.main_idea}</p>
            </div>
            {chunk.details.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Important details</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {chunk.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-lg bg-muted/60 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mini summary</p>
              <p className="mt-1">{chunk.mini_summary}</p>
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" size="sm" onClick={() => setPhase("recall")}>
                I have read this — ask me
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p id="recall-prompt" className="whitespace-pre-wrap font-medium">
              {item.prompt}
            </p>
            {!result ? (
              <>
                <Textarea id="recall-answer" rows={4} maxLength={8000} value={response} disabled={pending} placeholder="Answer from memory — the chunk is hidden now." onChange={(event) => setResponse(event.target.value)} />
                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setPhase("read")}>
                    Re-read the chunk
                  </Button>
                  <Button type="button" size="sm" loading={pending} onClick={check}>
                    {!pending && <Eye className="h-4 w-4" aria-hidden="true" />}
                    Reveal &amp; compare
                  </Button>
                </div>
              </>
            ) : (
              <>
                <VerdictBox score={result.comparison.score} passAt={PASS_SCORE.recall}>
                  <p className="mt-2">{result.comparison.feedback}</p>
                </VerdictBox>
                <div className="rounded-lg bg-success-soft/50 p-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Model answer</p>
                  <p className="mt-1 whitespace-pre-wrap">{result.modelAnswer}</p>
                </div>
                <div className="flex justify-end border-t border-border pt-4">
                  <Button type="button" size="sm" onClick={next} loading={ending}>
                    {index + 1 >= items.length ? "Finish session" : "Next chunk"}
                    {!ending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
