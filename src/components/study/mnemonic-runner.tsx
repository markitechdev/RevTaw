"use client";

import { ArrowRight, Bookmark, BookmarkCheck, Brain, Check, CircleCheck, CircleX, PenLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Field } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { RunnerDone, RunnerSummary, useSessionCompletion, VerdictBox, type RunnerProps } from "@/components/study/runner-kit";
import { PASS_SCORE } from "@/lib/study/verdict";
import { SessionHeader } from "@/components/study/session-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { MARKED, TINT } from "@/components/ui/tint";
import { routes } from "@/lib/routes";
import { MNEMONIC_KIND_LABEL, mnemonicResultOf, mnemonicViewOf, type MnemonicItemView, type MnemonicPracticeResult } from "@/lib/study/memory-options";
import { addOwnMnemonicAction, practiceMnemonicAction, saveItemDraftAction, saveMnemonicOptionAction } from "@/lib/study/method-actions";
import type { SessionDetail } from "@/lib/study/queries";
import { cn } from "@/lib/utils";

type Item = SessionDetail["items"][number];
type Draft = { chosen: number; answer: string };

function draftOf(item: Item | undefined): Draft | null {
  if (!item || item.answered_at || !item.response) return null;
  try {
    const parsed = JSON.parse(item.response) as Partial<Draft>;
    return typeof parsed.answer === "string" && parsed.answer.trim() ? { chosen: typeof parsed.chosen === "number" ? parsed.chosen : 0, answer: parsed.answer } : null;
  } catch {
    return null;
  }
}

/**
 * Mnemonics (§16): study the list with a memory device — pick one of the
 * generated acronyms, acrostics, rhymes or phrases, or write your own — save
 * the ones that work, then recall the whole list from the device alone.
 */
export function MnemonicRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to Tamari's plan" }: RunnerProps) {
  const items = session.items;
  const { summary, stoppedEarly, ending, error, setError, finish, pending, startTransition } = useSessionCompletion(session);
  const [index, setIndex] = useState(() => {
    const first = items.findIndex((entry) => !entry.answered_at);
    return first === -1 ? items.length : first;
  });
  const item = items[index];
  const [views, setViews] = useState<Record<string, MnemonicItemView>>(() =>
    Object.fromEntries(
      items
        .map((entry) => [entry.id, mnemonicViewOf(entry.analysis)] as const)
        .filter((entry): entry is readonly [string, MnemonicItemView] => entry[1] !== null),
    ),
  );
  const [results, setResults] = useState<Record<string, MnemonicPracticeResult>>(() =>
    Object.fromEntries(
      items
        .filter((entry) => entry.answered_at)
        .map((entry) => [entry.id, mnemonicResultOf(entry.analysis)] as const)
        .filter((entry): entry is readonly [string, MnemonicPracticeResult] => entry[1] !== null),
    ),
  );
  const initialDraft = draftOf(item);
  const [stage, setStage] = useState<"learn" | "practice">(initialDraft ? "practice" : "learn");
  const [chosen, setChosen] = useState(initialDraft?.chosen ?? 0);
  const [answer, setAnswer] = useState(initialDraft?.answer ?? "");
  const [own, setOwn] = useState<{ open: boolean; content: string; explanation: string }>({ open: false, content: "", explanation: "" });
  const shownAt = useRef<number>(0);

  useEffect(() => {
    if (stage === "practice") shownAt.current = Date.now();
  }, [stage, item?.id]);

  if (summary)
    return (
      <RunnerSummary
        methodName={methodName}
        summary={summary}
        stoppedEarly={stoppedEarly}
        parentSessionId={parentSessionId}
        parentLabel={parentLabel}
        extraActions={
          <Link href={routes.memoryAids} className={buttonClasses({ size: "sm", variant: "secondary" })}>
            Open memory aids
          </Link>
        }
      />
    );
  const view = item ? views[item.id] : undefined;
  if (!item || !view) return <RunnerDone session={session} methodName={methodName} message="Every list is practiced." ending={ending} onFinish={() => finish()} />;

  const result = results[item.id];
  const answered = Object.keys(results).length;
  const option = view.options[result ? result.chosen : chosen] ?? view.options[0];
  const optionIndex = view.options[result ? result.chosen : chosen] ? (result ? result.chosen : chosen) : 0;
  const recalled = result ? result.marks.filter(Boolean).length : 0;

  const updateView = (next: MnemonicItemView) => setViews((state) => ({ ...state, [item.id]: next }));

  const save = (target: number) => {
    setError(null);
    startTransition(async () => {
      const response = await saveMnemonicOptionAction({ itemId: item.id, optionIndex: target });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      updateView({ ...view, saved: { ...view.saved, [String(target)]: response.data.mnemonicId } });
    });
  };

  const addOwn = () => {
    setError(null);
    startTransition(async () => {
      const response = await addOwnMnemonicAction({ itemId: item.id, content: own.content, explanation: own.explanation.trim() || null });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      updateView({ ...view, options: [...view.options, response.data.option], saved: { ...view.saved, [String(response.data.optionIndex)]: response.data.mnemonicId } });
      setChosen(response.data.optionIndex);
      setOwn({ open: false, content: "", explanation: "" });
    });
  };

  const check = () => {
    setError(null);
    startTransition(async () => {
      const response = await practiceMnemonicAction({ itemId: item.id, optionIndex: chosen, answer, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
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
    setStage(upcoming ? "practice" : "learn");
    setChosen(upcoming?.chosen ?? 0);
    setAnswer(upcoming?.answer ?? "");
    setOwn({ open: false, content: "", explanation: "" });
  };

  const saveButton = (target: number) =>
    view.saved[String(target)] ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
        Saved to memory aids
      </span>
    ) : (
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => save(target)} aria-label={`Save the ${MNEMONIC_KIND_LABEL[view.options[target].kind].toLowerCase()} to memory aids`}>
        <Bookmark className="h-4 w-4" aria-hidden="true" />
        Save
      </Button>
    );

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`list ${index + 1} of ${items.length}`}
        onEnd={() => finish(answered === 0)}
        ending={ending}
        endLabel={answered === 0 ? "Stop" : "End & summarize"}
      />
      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="mnemonic-target" className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="neutral">
            <Brain className="h-3 w-3" aria-hidden="true" />
            {view.fromSaved ? "Saved mnemonic" : "Mnemonic"}
          </Badge>
          {item.concept && <Badge tone="primary">{item.concept.name}</Badge>}
          {view.ordered && view.items.length > 1 && <Badge tone="warning">Order matters</Badge>}
        </div>
        <h2 id="mnemonic-target" className="font-display tracking-display text-lg font-medium leading-snug">
          {view.target}
        </h2>

        {!result && stage === "learn" && (
          <>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What to remember</h3>
              <ol aria-label="The list to remember" className="mt-2 flex flex-col gap-1.5">
                {view.items.map((entry, position) => (
                  <li key={`${position}-${entry}`} className="flex gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <span className="font-semibold tabular-nums text-primary">{position + 1}.</span>
                    <span>{entry}</span>
                  </li>
                ))}
              </ol>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pick a memory device</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {view.options.map((entry, position) => (
                  <div key={`${position}-${entry.kind}`} className={cn("flex flex-col gap-2 rounded-lg border p-3 transition-colors", chosen === position ? MARKED : "border-border")}>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input type="radio" name="mnemonic-option" value={position} checked={chosen === position} onChange={() => setChosen(position)} className="mt-1 h-4 w-4 accent-primary" />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{MNEMONIC_KIND_LABEL[entry.kind]}</span>
                        <span className={cn("whitespace-pre-wrap break-words", entry.kind === "acronym" ? "text-xl font-semibold tracking-wider" : "text-reading font-medium")}>{entry.content}</span>
                      </span>
                    </label>
                    {entry.explanation && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">How it maps: </span>
                        {entry.explanation}
                      </p>
                    )}
                    <div className="mt-auto flex justify-end">{saveButton(position)}</div>
                  </div>
                ))}
              </div>
            </fieldset>

            {own.open ? (
              <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
                <Field id="own-mnemonic" label="Your mnemonic" hint="An acronym, a sentence, a rhyme — whatever makes the list stick for you.">
                  <Textarea id="own-mnemonic" rows={3} maxLength={2000} value={own.content} disabled={pending} onChange={(event) => setOwn({ ...own, content: event.target.value })} />
                </Field>
                <Field id="own-explanation" label="What each part stands for (optional)">
                  <Input id="own-explanation" maxLength={2000} value={own.explanation} disabled={pending} onChange={(event) => setOwn({ ...own, explanation: event.target.value })} />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setOwn({ open: false, content: "", explanation: "" })}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" loading={pending} disabled={own.content.trim().length < 2} onClick={addOwn}>
                    Save my mnemonic
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" size="sm" variant="secondary" className="self-start" onClick={() => setOwn({ ...own, open: true })}>
                <PenLine className="h-4 w-4" aria-hidden="true" />
                Write my own
              </Button>
            )}

            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" size="sm" onClick={() => setStage("practice")}>
                I know it — test me
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </>
        )}

        {!result && stage === "practice" && (
          <>
            <div className={`rounded-lg border p-3 ${TINT.primary}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your cue · {MNEMONIC_KIND_LABEL[option.kind]}</p>
              <p className={cn("mt-1 whitespace-pre-wrap break-words", option.kind === "acronym" ? "text-xl font-semibold tracking-wider" : "text-reading font-medium")}>{option.content}</p>
            </div>
            <Field id="mnemonic-answer" label={`Write the ${view.items.length} items from memory${view.ordered && view.items.length > 1 ? ", in order" : ""}`} hint="One item per line. Use the cue, not the list.">
              <Textarea
                id="mnemonic-answer"
                rows={Math.min(10, view.items.length + 1)}
                maxLength={4000}
                value={answer}
                disabled={pending}
                onChange={(event) => setAnswer(event.target.value)}
                onBlur={() => void saveItemDraftAction({ itemId: item.id, draft: JSON.stringify({ chosen, answer }) })}
              />
            </Field>
            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setStage("learn")}>
                Look at the list again
              </Button>
              <Button type="button" size="sm" loading={pending} disabled={!answer.trim()} onClick={check}>
                {!pending && <Check className="h-4 w-4" aria-hidden="true" />}
                Check my list
              </Button>
            </div>
          </>
        )}

        {result && (
          <>
            <VerdictBox score={result.score} passAt={PASS_SCORE.list}>
              <p className="mt-1">
                You recalled {recalled} of {view.items.length}
                {view.ordered && view.items.length > 1 && recalled > 1 ? (result.inOrder ? ", in the right order." : " — but the order slipped.") : "."}
              </p>
            </VerdictBox>
            <ol aria-label="Your recall, item by item" className="flex flex-col gap-1.5 text-sm">
              {view.items.map((entry, position) => (
                <li key={`${position}-${entry}`} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2", result.marks[position] ? TINT.success : TINT.danger)}>
                  {result.marks[position] ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    {position + 1}. {entry}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{result.marks[position] ? "recalled" : "missed"}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your cue · {MNEMONIC_KIND_LABEL[option.kind]}</p>
              <p className="whitespace-pre-wrap font-medium">{option.content}</p>
              {option.explanation && <p className="text-muted-foreground">{option.explanation}</p>}
              <div className="flex justify-end">{saveButton(optionIndex)}</div>
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" size="sm" onClick={next} loading={ending}>
                {index + 1 >= items.length ? "Finish session" : "Next list"}
                {!ending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
