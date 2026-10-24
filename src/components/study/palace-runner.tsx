"use client";

import { ArrowRight, Castle, Check, CircleCheck, CircleX, Footprints, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Field } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { PalaceEditor, RouteLine } from "@/components/study/palace-editor";
import { RunnerDone, RunnerSummary, useSessionCompletion, VerdictBox, type RunnerProps } from "@/components/study/runner-kit";
import { SessionHeader } from "@/components/study/session-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { routes } from "@/lib/routes";
import { lociResultOf, lociViewOf, palaceStateOf, type LociResult, type PalaceInput, type PalaceSummary } from "@/lib/study/memory-options";
import { answerLociAction, placeConceptsAction, startWalkAction } from "@/lib/study/method-actions";
import { cn } from "@/lib/utils";

type PalaceRunnerProps = RunnerProps & { palaces: PalaceSummary[] };

const memoryAidsLink = (
  <Link href={routes.memoryAids} className={buttonClasses({ size: "sm", variant: "secondary" })}>
    Open memory aids
  </Link>
);

/** Choose or build the route, then let RevTaw place the concepts along it. */
function PalaceSetup({ session, methodName, palaces, parentSessionId = null, parentLabel }: PalaceRunnerProps) {
  const router = useRouter();
  const { summary, stoppedEarly, ending, error, setError, finish, pending, startTransition } = useSessionCompletion(session);
  const [choice, setChoice] = useState<string>(palaces[0]?.id ?? "new");
  const [editRequested, setEditRequested] = useState(false);
  const [fresh, setFresh] = useState(false);

  if (summary) return <RunnerSummary methodName={methodName} summary={summary} stoppedEarly={stoppedEarly} parentSessionId={parentSessionId} parentLabel={parentLabel} extraActions={memoryAidsLink} />;
  const chosen = palaces.find((palace) => palace.id === choice) ?? null;
  const showEditor = !chosen || editRequested;

  const place = (palace: PalaceInput & { id: string | null }) => {
    setError(null);
    startTransition(async () => {
      const result = await placeConceptsAction({ sessionId: session.id, palace, fresh });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader title={session.title} methodName={methodName} startedAt={session.started_at} plannedMinutes={session.planned_minutes} progressLabel="choose a route" onEnd={() => finish(true)} ending={ending} endLabel="Stop" />
      {error && <Alert tone="error">{error}</Alert>}
      <section aria-labelledby="palace-setup" className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h2 id="palace-setup" className="font-display tracking-display text-lg font-medium">
            {palaces.length ? "Choose your memory palace" : "Build your first memory palace"}
          </h2>
          <p className="text-sm text-muted-foreground">Pick a place you know well. RevTaw puts one key concept from the material at each location, in walking order, with an image that still says what it means.</p>
        </div>

        {palaces.length > 0 && (
          <fieldset className="flex flex-col gap-2" disabled={pending}>
            <legend className="sr-only">Memory palace</legend>
            {[...palaces, null].map((palace) => {
              const id = palace?.id ?? "new";
              return (
                <label key={id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm", choice === id ? "border-primary bg-primary-soft/40" : "border-border hover:bg-muted/60")}>
                  <input
                    type="radio"
                    name="palace"
                    value={id}
                    checked={choice === id}
                    onChange={() => {
                      setChoice(id);
                      setEditRequested(false);
                    }}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">{palace ? `${palace.title} · ${palace.locations.length} locations` : "A new palace"}</span>
                    {palace ? <RouteLine locations={palace.locations} /> : <span className="text-muted-foreground">Build another route.</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        {showEditor ? (
          <PalaceEditor
            key={choice}
            initial={chosen ? { title: chosen.title, locations: chosen.locations } : { title: "", locations: [] }}
            submitLabel={chosen ? "Save the route & place the concepts" : "Save & place the concepts"}
            pending={pending}
            onSubmit={(value) => place({ ...value, id: chosen?.id ?? null })}
            onCancel={chosen ? () => setEditRequested(false) : undefined}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={fresh} disabled={pending} onChange={(event) => setFresh(event.target.checked)} className="h-4 w-4 accent-primary" />
              New images instead of the ones from your last walk here
            </label>
            <span className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditRequested(true)}>
                Edit the route
              </Button>
              <Button type="button" size="sm" loading={pending} onClick={() => chosen && place({ id: chosen.id, title: chosen.title, locations: chosen.locations })}>
                Place the concepts
                {!pending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

/** Study the placements: each stop, its concept, its image and what it means. */
function PalacePlacements({ session, methodName, parentSessionId = null, parentLabel }: PalaceRunnerProps) {
  const router = useRouter();
  const state = palaceStateOf(session.state);
  const { summary, stoppedEarly, ending, error, setError, finish, pending, startTransition } = useSessionCompletion(session);
  if (summary) return <RunnerSummary methodName={methodName} summary={summary} stoppedEarly={stoppedEarly} parentSessionId={parentSessionId} parentLabel={parentLabel} extraActions={memoryAidsLink} />;

  const walk = () => {
    setError(null);
    startTransition(async () => {
      const result = await startWalkAction({ sessionId: session.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader title={session.title} methodName={methodName} startedAt={session.started_at} plannedMinutes={session.planned_minutes} progressLabel={`${state.placements.length} stops placed`} onEnd={() => finish(true)} ending={ending} endLabel="Stop" />
      {error && <Alert tone="error">{error}</Alert>}
      <section aria-labelledby="palace-placements" className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="neutral">
              <Castle className="h-3 w-3" aria-hidden="true" />
              {state.palaceTitle ?? "Memory palace"}
            </Badge>
          </div>
          <h2 id="palace-placements" className="font-display tracking-display text-lg font-medium">
            Picture each image at its place
          </h2>
          <p className="text-sm text-muted-foreground">Walk the route in your mind twice, seeing every image where it sits. When you start the walk, the concepts are hidden and you name each one at its stop.</p>
        </div>
        <ol aria-label="The placements along your route" className="relative flex flex-col gap-3 border-l-2 border-primary/40 pl-5">
          {state.placements.map((placement) => (
            <li key={placement.stop} className="relative flex flex-col gap-1 rounded-lg border border-border p-3 text-sm">
              <span className="absolute -left-[1.95rem] top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary bg-card text-[10px] font-semibold text-primary" aria-hidden="true">
                {placement.stop}
              </span>
              <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Stop {placement.stop} · {placement.location}
                {placement.detail && <span className="font-normal normal-case tracking-normal">({placement.detail})</span>}
              </p>
              <p className="text-base font-semibold">{placement.concept}</p>
              <p>
                <span className="font-medium">Image: </span>
                {placement.association}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Meaning: </span>
                {placement.definition}
              </p>
            </li>
          ))}
        </ol>
        <div className="flex justify-end border-t border-border pt-4">
          <Button type="button" size="sm" loading={pending} onClick={walk}>
            {!pending && <Footprints className="h-4 w-4" aria-hidden="true" />}
            Start the walk
          </Button>
        </div>
      </section>
    </div>
  );
}

/** The walk (§16 "guide the student through the route during recall"): one stop at a time, in order. */
function PalaceWalk({ session, methodName, parentSessionId = null, parentLabel }: PalaceRunnerProps) {
  const stops = session.items.filter((item) => item.kind === "loci");
  const { summary, stoppedEarly, ending, error, setError, finish, pending, startTransition } = useSessionCompletion(session);
  const [index, setIndex] = useState(() => {
    const first = stops.findIndex((item) => !item.answered_at);
    return first === -1 ? stops.length : first;
  });
  const [results, setResults] = useState<Record<string, LociResult>>(() =>
    Object.fromEntries(
      stops
        .filter((item) => item.answered_at)
        .map((item) => [item.id, lociResultOf(item.analysis)] as const)
        .filter((entry): entry is readonly [string, LociResult] => entry[1] !== null),
    ),
  );
  const [answer, setAnswer] = useState("");
  const shownAt = useRef<number>(0);
  const item = stops[index];

  useEffect(() => {
    shownAt.current = Date.now();
  }, [item?.id]);

  if (summary) return <RunnerSummary methodName={methodName} summary={summary} stoppedEarly={stoppedEarly} parentSessionId={parentSessionId} parentLabel={parentLabel} extraActions={memoryAidsLink} />;
  const view = item ? lociViewOf(item.analysis) : null;
  if (!item || !view) return <RunnerDone session={session} methodName={methodName} message="The walk is done — every stop is named." ending={ending} onFinish={() => finish()} />;

  const result = results[item.id];
  const answered = Object.keys(results).length;

  const submit = (given: string) => {
    setError(null);
    startTransition(async () => {
      const response = await answerLociAction({ itemId: item.id, answer: given, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setResults((state) => ({ ...state, [item.id]: response.data }));
    });
  };

  const next = () => {
    if (index + 1 >= stops.length) {
      finish();
      return;
    }
    setIndex(index + 1);
    setAnswer("");
  };

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`stop ${index + 1} of ${stops.length}`}
        onEnd={() => finish(answered === 0)}
        ending={ending}
        endLabel={answered === 0 ? "Stop" : "End & summarize"}
      />
      {error && <Alert tone="error">{error}</Alert>}
      <nav aria-label="Your route" className="mx-auto w-full max-w-3xl">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs">
          {stops.map((stop, position) => {
            const stopView = lociViewOf(stop.analysis);
            const stopResult = results[stop.id];
            return (
              <li
                key={stop.id}
                aria-current={position === index ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1",
                  position === index ? "border-primary bg-primary-soft/50 font-medium text-foreground" : "border-border text-muted-foreground",
                  stopResult?.isCorrect && "border-success/40",
                  stopResult && !stopResult.isCorrect && "border-danger/40",
                )}
              >
                {stopResult ? stopResult.isCorrect ? <CircleCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <CircleX className="h-3.5 w-3.5 text-danger" aria-hidden="true" /> : null}
                <span>
                  {position + 1}. {stopView?.location ?? "Stop"}
                </span>
                {stopResult && <span className="sr-only">{stopResult.isCorrect ? "(named)" : "(missed)"}</span>}
              </li>
            );
          })}
        </ol>
      </nav>

      <section aria-labelledby="loci-location" className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Stop {view.stop} of {view.total}
          </p>
          <h2 id="loci-location" className="font-display tracking-display text-xl font-semibold">
            {view.location}
          </h2>
          {view.detail && <p className="text-sm text-muted-foreground">{view.detail}</p>}
          <p className="text-sm text-muted-foreground">{view.previous ? `You walk on from the ${view.previous}. Look around — what is here?` : "You are at the start of your route. Look around — what is here?"}</p>
        </div>

        {!result ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (answer.trim()) submit(answer);
            }}
          >
            <Field id="loci-answer" label="What did you place here?">
              <Input id="loci-answer" autoComplete="off" maxLength={300} value={answer} disabled={pending} onChange={(event) => setAnswer(event.target.value)} placeholder="The concept's name" />
            </Field>
            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => submit("")}>
                I don&apos;t remember
              </Button>
              <Button type="submit" size="sm" loading={pending} disabled={!answer.trim()}>
                {!pending && <Check className="h-4 w-4" aria-hidden="true" />}
                Check
              </Button>
            </div>
          </form>
        ) : (
          <>
            <VerdictBox verdict={result.isCorrect ? "correct" : "incorrect"} score={result.isCorrect ? 100 : 0}>
              <p className="mt-1">{result.isCorrect ? `Yes — ${result.concept} sits here.` : result.given ? `You said “${result.given}”. Here it was ${result.concept}.` : `Here it was ${result.concept}.`}</p>
            </VerdictBox>
            <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3 text-sm">
              <p>
                <span className="font-medium">Your image: </span>
                {result.association}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">What it means: </span>
                {result.definition}
              </p>
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" size="sm" onClick={next} loading={ending}>
                {index + 1 >= stops.length ? "Finish the walk" : "Next stop"}
                {!ending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Memory palace (§16 method of loci): define locations, associate concepts
 * with them, then walk the route and recall what sits at each stop.
 */
export function PalaceRunner(props: PalaceRunnerProps) {
  const stage = palaceStateOf(props.session.state).stage;
  if (stage === "walk") return <PalaceWalk {...props} />;
  if (stage === "place") return <PalacePlacements {...props} />;
  return <PalaceSetup {...props} />;
}
