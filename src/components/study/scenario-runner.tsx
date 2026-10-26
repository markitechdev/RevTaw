"use client";

import { ArrowRight, Check, Compass } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/forms/form-alert";
import { PointList, RunnerDone, RunnerSummary, useSessionCompletion, VerdictBox, type RunnerProps } from "@/components/study/runner-kit";
import { scenarioVerdict } from "@/lib/study/verdict";
import { SessionHeader } from "@/components/study/session-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { MARKED, TINT } from "@/components/ui/tint";
import type { ScenarioResult, ScenarioView } from "@/lib/study/flows/applied";
import { evaluateScenarioAction, saveItemDraftAction } from "@/lib/study/method-actions";
import type { SessionDetail } from "@/lib/study/queries";
import { cn } from "@/lib/utils";

type Item = SessionDetail["items"][number];
type Draft = { choice: number | null; justification: string };

function viewOf(item: Item | undefined): ScenarioView | null {
  return (item?.analysis as { scenario?: ScenarioView } | null)?.scenario ?? null;
}

function draftOf(item: Item | undefined): Draft {
  if (!item || item.answered_at || !item.response) return { choice: null, justification: "" };
  try {
    const parsed = JSON.parse(item.response) as Partial<Draft>;
    return { choice: typeof parsed.choice === "number" ? parsed.choice : null, justification: typeof parsed.justification === "string" ? parsed.justification : "" };
  } catch {
    return { choice: null, justification: "" };
  }
}

/**
 * Scenario-based learning (§16): a realistic situation, plausible actions,
 * and a justification. The choice and the reasoning are graded separately.
 */
export function ScenarioRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to Tamari's plan" }: RunnerProps) {
  const items = session.items;
  const { summary, stoppedEarly, ending, error, setError, finish, pending, startTransition } = useSessionCompletion(session);
  const [index, setIndex] = useState(() => {
    const first = items.findIndex((entry) => !entry.answered_at);
    return first === -1 ? items.length : first;
  });
  const item = items[index];
  const [draft, setDraft] = useState<Draft>(() => draftOf(item));
  const [results, setResults] = useState<Record<string, ScenarioResult>>(() =>
    Object.fromEntries(items.filter((entry) => entry.answered_at && (entry.analysis as { result?: ScenarioResult } | null)?.result).map((entry) => [entry.id, (entry.analysis as { result: ScenarioResult }).result])),
  );
  const shownAt = useRef<number>(0);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [item?.id]);

  if (summary) return <RunnerSummary methodName={methodName} summary={summary} stoppedEarly={stoppedEarly} parentSessionId={parentSessionId} parentLabel={parentLabel} />;
  const view = viewOf(item);
  if (!item || !view) return <RunnerDone session={session} methodName={methodName} message="Every scenario is done." ending={ending} onFinish={() => finish()} />;

  const result = results[item.id];
  const answered = Object.keys(results).length;

  const saveDraft = (next: Draft) => {
    void saveItemDraftAction({ itemId: item.id, draft: JSON.stringify(next) });
  };

  const submit = () => {
    if (draft.choice === null) return;
    setError(null);
    startTransition(async () => {
      const response = await evaluateScenarioAction({ itemId: item.id, choice: draft.choice!, justification: draft.justification, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setResults((state) => ({ ...state, [item.id]: response.data }));
    });
  };

  const next = () => {
    if (index + 1 >= items.length) {
      finish();
      return;
    }
    setIndex(index + 1);
    setDraft(draftOf(items[index + 1]));
  };

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`scenario ${index + 1} of ${items.length}`}
        onEnd={() => finish(answered === 0)}
        ending={ending}
        endLabel={answered === 0 ? "Stop" : "End & summarize"}
      />
      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="scenario-title" className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="neutral">
            <Compass className="h-3 w-3" aria-hidden="true" />
            Scenario
          </Badge>
          {item.concept && <Badge tone="primary">{item.concept.name}</Badge>}
        </div>
        <h2 id="scenario-title" className="font-display tracking-display text-lg font-medium leading-snug">
          {view.title}
        </h2>
        <p className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-reading">{view.situation}</p>

        <fieldset disabled={pending || Boolean(result)} className="flex flex-col gap-2">
          <legend id="scenario-question" className="mb-1 font-medium">
            {view.question}
          </legend>
          {view.options.map((option, optionIndex) => {
            const isBest = result && optionIndex === result.best;
            const isChosen = (result ? result.chosen : draft.choice) === optionIndex;
            return (
              <label
                key={`${optionIndex}-${option}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-muted/60",
                  isChosen && !result && MARKED,
                  result && isBest && TINT.success,
                  result && isChosen && !isBest && TINT.danger,
                )}
              >
                <input
                  type="radio"
                  name="scenario-option"
                  value={optionIndex}
                  checked={isChosen}
                  onChange={() => {
                    const next = { ...draft, choice: optionIndex };
                    setDraft(next);
                    saveDraft(next);
                  }}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span>{option}</span>
                  {result && (isBest || isChosen) && (
                    <span className="text-xs text-muted-foreground">
                      {isBest ? "Best action. " : "Your choice. "}
                      {result.optionFeedback[optionIndex]}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>

        {!result ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="scenario-justification" className="text-sm font-medium">
                Justify your choice
              </label>
              <Textarea
                id="scenario-justification"
                rows={4}
                maxLength={4000}
                value={draft.justification}
                disabled={pending}
                placeholder="Why is this the right action? Use the ideas from the material."
                onChange={(event) => setDraft({ ...draft, justification: event.target.value })}
                onBlur={() => saveDraft(draft)}
              />
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" size="sm" loading={pending} disabled={draft.choice === null || draft.justification.trim().length < 10} onClick={submit}>
                {!pending && <Check className="h-4 w-4" aria-hidden="true" />}
                Submit decision
              </Button>
            </div>
          </>
        ) : (
          <>
            <VerdictBox verdict={scenarioVerdict(result)} score={result.score}>
              <p className="mt-2">{result.correctChoice ? "You picked the best action." : "Another action was better here."} {result.evaluation.feedback}</p>
            </VerdictBox>
            <div className="rounded-lg bg-success-soft/50 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why the best action is best</p>
              <p className="mt-1 whitespace-pre-wrap">{result.rationale}</p>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <PointList title="Your reasoning — strengths" items={result.evaluation.strengths} tone="success" />
              <PointList title="Your reasoning — gaps" items={result.evaluation.gaps} tone="danger" />
            </div>
            <p className="text-xs text-muted-foreground">Justification score: {Math.round(result.evaluation.justification_score)}%</p>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" size="sm" onClick={next} loading={ending}>
                {index + 1 >= items.length ? "Finish session" : "Next scenario"}
                {!ending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
