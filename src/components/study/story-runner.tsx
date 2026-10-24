"use client";

import { ArrowRight, BookOpenText, Check, CircleCheck, CircleX, ScrollText } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Field } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { PointList, RunnerDone, RunnerSummary, useSessionCompletion, VerdictBox, type RunnerProps } from "@/components/study/runner-kit";
import { SessionHeader } from "@/components/study/session-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { MARKED, TINT } from "@/components/ui/tint";
import { storyResultOf, storyViewOf, type StoryResult, type StoryView } from "@/lib/study/memory-options";
import { checkStoryRetellAction, saveItemDraftAction } from "@/lib/study/method-actions";
import type { SessionDetail } from "@/lib/study/queries";
import { cn } from "@/lib/utils";

type Item = SessionDetail["items"][number];
type View = "side" | "notes" | "story";

function draftOf(item: Item | undefined): string {
  return item && !item.answered_at && item.response ? item.response : "";
}

/** The original notes, numbered; facts the retelling recalled are marked once there is a result. */
function OriginalNotes({ view, result, highlighted, onHover }: { view: StoryView; result: StoryResult | null; highlighted: number[]; onHover?: (facts: number[]) => void }) {
  return (
    <ol aria-label="Original notes" className="flex flex-col gap-1.5 text-sm">
      {view.facts.map((fact, index) => {
        const number = index + 1;
        const recalled = result ? result.recalled[index] : null;
        return (
          <li
            key={`${number}-${fact}`}
            onMouseEnter={onHover ? () => onHover([number]) : undefined}
            onMouseLeave={onHover ? () => onHover([]) : undefined}
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors",
              recalled === null && (highlighted.includes(number) ? MARKED : "border-border"),
              recalled === true && TINT.success,
              recalled === false && TINT.danger,
            )}
          >
            {recalled === true ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : recalled === false ? <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" /> : <span className="w-5 shrink-0 font-semibold tabular-nums text-primary">{number}.</span>}
            <span className="min-w-0 flex-1">{fact}</span>
            {recalled !== null && <span className="shrink-0 text-xs text-muted-foreground">{recalled ? "retold" : "missed"}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** The story version; each paragraph names the facts it carries. */
function StoryVersion({ view, highlighted, onHover }: { view: StoryView; highlighted: number[]; onHover?: (facts: number[]) => void }) {
  return (
    <div className="flex flex-col gap-3 text-reading">
      {view.paragraphs.map((paragraph, index) => (
        <p
          key={index}
          onMouseEnter={onHover ? () => onHover(paragraph.facts) : undefined}
          onMouseLeave={onHover ? () => onHover([]) : undefined}
          className={cn("rounded-lg px-3 py-2 transition-colors", paragraph.facts.some((fact) => highlighted.includes(fact)) ? "bg-primary-soft/40" : "bg-muted/40")}
        >
          {paragraph.text}
          {paragraph.facts.length > 0 && (
            <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
              {paragraph.facts.map((fact) => (
                <span key={fact} className="rounded-full border border-primary/40 px-1.5 text-3xs font-semibold text-primary" aria-label={`carries fact ${fact}`}>
                  {fact}
                </span>
              ))}
            </span>
          )}
        </p>
      ))}
      {view.accuracyNote && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${TINT.warning}`}>
          <span className="font-medium">What the story simplifies: </span>
          {view.accuracyNote}
        </p>
      )}
    </div>
  );
}

/**
 * Story method (§16): related facts turned into a memorable, academically
 * accurate story. Original notes and story version side by side; then the
 * student retells the story and every fact is checked.
 */
export function StoryRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to Tamari's plan" }: RunnerProps) {
  const items = session.items;
  const { summary, stoppedEarly, ending, error, setError, finish, pending, startTransition } = useSessionCompletion(session);
  const [index, setIndex] = useState(() => {
    const first = items.findIndex((entry) => !entry.answered_at);
    return first === -1 ? items.length : first;
  });
  const item = items[index];
  const [results, setResults] = useState<Record<string, StoryResult>>(() =>
    Object.fromEntries(
      items
        .filter((entry) => entry.answered_at)
        .map((entry) => [entry.id, storyResultOf(entry.analysis)] as const)
        .filter((entry): entry is readonly [string, StoryResult] => entry[1] !== null),
    ),
  );
  const [stage, setStage] = useState<"read" | "retell">(() => (draftOf(item) ? "retell" : "read"));
  const [layout, setLayout] = useState<View>("side");
  const [highlighted, setHighlighted] = useState<number[]>([]);
  const [retell, setRetell] = useState(() => draftOf(item));
  const shownAt = useRef<number>(0);

  useEffect(() => {
    if (stage === "retell") shownAt.current = Date.now();
  }, [stage, item?.id]);

  if (summary) return <RunnerSummary methodName={methodName} summary={summary} stoppedEarly={stoppedEarly} parentSessionId={parentSessionId} parentLabel={parentLabel} />;
  const view = item ? storyViewOf(item.analysis) : null;
  if (!item || !view) return <RunnerDone session={session} methodName={methodName} message="Every story is retold." ending={ending} onFinish={() => finish()} />;

  const result = results[item.id] ?? null;
  const answered = Object.keys(results).length;
  const kept = result ? result.recalled.filter(Boolean).length : 0;

  const check = () => {
    setError(null);
    startTransition(async () => {
      const response = await checkStoryRetellAction({ itemId: item.id, retell, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
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
    const upcoming = draftOf(items[index + 1]);
    setIndex(index + 1);
    setStage(upcoming ? "retell" : "read");
    setRetell(upcoming);
    setHighlighted([]);
  };

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`story ${index + 1} of ${items.length}`}
        onEnd={() => finish(answered === 0)}
        ending={ending}
        endLabel={answered === 0 ? "Stop" : "End & summarize"}
      />
      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="story-title" className="mx-auto flex w-full max-w-5xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="neutral">
            <ScrollText className="h-3 w-3" aria-hidden="true" />
            Story
          </Badge>
          {item.concept && <Badge tone="primary">{item.concept.name}</Badge>}
          <span className="text-muted-foreground">{view.facts.length} facts</span>
        </div>
        <h2 id="story-title" className="font-display tracking-display text-lg font-medium leading-snug">
          {view.title}
        </h2>

        {!result && stage === "read" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Read the story with the notes it carries. Characters and scenes are invented; every numbered fact is the material&apos;s own.</p>
              <Segmented
                label="View"
                name={`story-view-${item.id}`}
                value={layout}
                onChange={setLayout}
                size="sm"
                options={[
                  { value: "side", label: "Side by side" },
                  { value: "notes", label: "Original notes" },
                  { value: "story", label: "Story version" },
                ]}
              />
            </div>
            <div className={cn("grid gap-4", layout === "side" && "lg:grid-cols-2")}>
              {layout !== "story" && (
                <div className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <BookOpenText className="h-3.5 w-3.5" aria-hidden="true" />
                    Original notes
                  </h3>
                  <OriginalNotes view={view} result={null} highlighted={highlighted} onHover={setHighlighted} />
                </div>
              )}
              {layout !== "notes" && (
                <div className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
                    Story version
                  </h3>
                  <StoryVersion view={view} highlighted={highlighted} onHover={setHighlighted} />
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" size="sm" onClick={() => setStage("retell")}>
                Retell it from memory
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </>
        )}

        {!result && stage === "retell" && (
          <>
            <Field id="story-retell" label="Retell the story in your own words" hint="Keep every fact in. The characters can change; the facts cannot.">
              <Textarea
                id="story-retell"
                rows={8}
                maxLength={8000}
                value={retell}
                disabled={pending}
                onChange={(event) => setRetell(event.target.value)}
                onBlur={() => void saveItemDraftAction({ itemId: item.id, draft: retell })}
              />
            </Field>
            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setStage("read")}>
                Read it again
              </Button>
              <Button type="button" size="sm" loading={pending} disabled={retell.trim().length < 3} onClick={check}>
                {!pending && <Check className="h-4 w-4" aria-hidden="true" />}
                Check my retelling
              </Button>
            </div>
          </>
        )}

        {result && (
          <>
            <VerdictBox verdict={result.isCorrect ? "correct" : result.score >= 40 ? "partial" : "incorrect"} score={result.score}>
              <p className="mt-1">
                {/^You kept \d+ of \d+ facts/.test(result.feedback) ? result.feedback : `You kept ${kept} of ${view.facts.length} facts. ${result.feedback}`}
              </p>
            </VerdictBox>
            <PointList title="Contradicts the notes" items={result.incorrect} tone="danger" />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Original notes</h3>
                <OriginalNotes view={view} result={result} highlighted={[]} />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Story version</h3>
                <StoryVersion view={view} highlighted={[]} />
              </div>
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" size="sm" onClick={next} loading={ending}>
                {index + 1 >= items.length ? "Finish session" : "Next story"}
                {!ending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
