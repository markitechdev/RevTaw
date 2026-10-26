"use client";

import { ArrowLeft, ArrowRight, BookOpenCheck, Check, Eye, Lightbulb, ListChecks, Plus, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Alert } from "@/components/forms/form-alert";
import { ScheduleReviewsButton } from "@/components/planner/schedule-reviews-button";
import { PointList, RecallVerdict, RunnerSummary, UngradedCheck, useAnsweredItems, useSessionCompletion, VerdictBox, type RunnerProps } from "@/components/study/runner-kit";
import { PASS_SCORE } from "@/lib/study/verdict";
import { SessionHeader } from "@/components/study/session-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { TINT } from "@/components/ui/tint";
import { answerRecallAction } from "@/lib/study/actions";
import type { BlurtComparison } from "@/lib/study/ai";
import type { ReadingSummaryResult } from "@/lib/study/flows/reading";
import { advanceReadingAction, markSectionReadAction, submitReadingSummaryAction } from "@/lib/study/method-actions";
import type { SessionDetail } from "@/lib/study/queries";
import { MAX_QUESTIONS_PER_SECTION, READING_STAGE_LABEL, READING_STAGES, readReadingState, suggestQuestion, type ReadingMethod, type ReadingStage, type ReadingState } from "@/lib/study/reading-options";
import { recallResultOf, ungradedView, type RecallItemResult } from "@/lib/study/results";
import { cn } from "@/lib/utils";

type Item = SessionDetail["items"][number];

function Stepper({ method, stage }: { method: ReadingMethod; stage: ReadingStage }) {
  const stages = READING_STAGES[method];
  const current = stage === "done" ? stages.length : stages.indexOf(stage as (typeof stages)[number]);
  return (
    <nav aria-label="Reading stages" className="mx-auto w-full max-w-3xl">
      <ol className="flex flex-wrap gap-1.5">
        {stages.map((entry, index) => (
          <li
            key={entry}
            aria-current={index === current ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              index < current && `text-success ${TINT.success}`,
              index === current && "border-primary bg-primary-soft text-primary",
              index > current && "border-border text-muted-foreground",
            )}
          >
            {index < current ? <Check className="h-3 w-3" aria-hidden="true" /> : <span aria-hidden="true">{index + 1}</span>}
            {READING_STAGE_LABEL[method][entry]}
            {index < current && <span className="sr-only">(done)</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Panel({ title, icon: Icon, intro, children }: { title: string; icon: typeof Eye; intro: string; children: ReactNode }) {
  return (
    <section aria-labelledby="reading-stage-title" className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 id="reading-stage-title" className="font-display tracking-display flex items-center gap-2 text-lg font-medium">
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      </div>
      {children}
    </section>
  );
}

function SectionText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 text-reading">
      {text.split(/\n{2,}|\n(?=[A-Z])/).map((paragraph, index) => (
        <p key={index} className="whitespace-pre-wrap">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/** Answer one item at a time (Reflect and Recite): the model answer appears only after the student answers. */
function AnswerStep({ items, label, onDone, onAnswered, doneLabel, sections }: { items: Item[]; label: string; onDone: () => void; onAnswered: (itemId: string) => void; doneLabel: string; sections: ReadingState["sections"] }) {
  const [index, setIndex] = useState(() => Math.max(0, items.findIndex((item) => !item.answered_at)));
  const [response, setResponse] = useState("");
  const [results, setResults] = useState<Record<string, RecallItemResult>>(() =>
    Object.fromEntries(items.flatMap((item) => {
      const stored = recallResultOf(item);
      return stored ? [[item.id, stored] as const] : [];
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const shownAt = useRef<number>(0);
  const item = items[index];

  useEffect(() => {
    shownAt.current = Date.now();
  }, [item?.id]);

  const allDone = items.every((entry) => results[entry.id] || entry.answered_at);
  if (!item) return null;
  const result = results[item.id];
  const section = (item.analysis as { section?: number } | null)?.section;

  const check = async () => {
    setError(null);
    setPending(true);
    const answered = await answerRecallAction({ itemId: item.id, response, confidence: null, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
    setPending(false);
    if (!answered.ok) {
      setError(answered.message);
      return;
    }
    setResults((state) => ({ ...state, [item.id]: answered.data }));
    onAnswered(item.id);
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="neutral">{label}</Badge>
        {typeof section === "number" && sections[section] && <Badge tone="primary">{sections[section].heading}</Badge>}
        <span className="text-muted-foreground">
          {index + 1} of {items.length}
        </span>
      </div>
      <p id="reading-prompt" className="text-reading font-medium">
        {item.prompt}
      </p>
      {!result ? (
        <>
          <Textarea id="reading-answer" rows={4} maxLength={8000} value={response} disabled={pending} placeholder="Answer from memory — the text is hidden now." onChange={(event) => setResponse(event.target.value)} aria-labelledby="reading-prompt" />
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="button" size="sm" loading={pending} onClick={check}>
              {!pending && <Eye className="h-4 w-4" aria-hidden="true" />}
              Check my answer
            </Button>
          </div>
        </>
      ) : (
        <>
          <RecallVerdict itemId={item.id} result={result} />
          {result.comparison && (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <PointList title="You covered" items={result.comparison.correct_points} tone="success" />
              <PointList title="Missing" items={result.comparison.missing_points} tone="danger" />
            </div>
          )}
          <div className="rounded-lg bg-success-soft/50 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From the material</p>
            <p className="mt-1 whitespace-pre-wrap">{result.modelAnswer}</p>
          </div>
          <div className="flex justify-end border-t border-border pt-4">
            {index + 1 < items.length ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setResponse("");
                  setIndex(index + 1);
                }}
              >
                Next question
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={!allDone} onClick={onDone}>
                {doneLabel}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * SQ3R / PQ4R (§16): a stage-by-stage guide — Survey/Preview, Question, Read,
 * (Reflect), Recite, Review. The stage and progress are saved on the server,
 * so a refresh comes back to the same place.
 */
export function ReadingRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to Tamari's plan" }: RunnerProps) {
  const router = useRouter();
  const method = session.method as ReadingMethod;
  const initial = readReadingState(session.state);
  const { summary, stoppedEarly, ending, error, setError, finish, pending, startTransition } = useSessionCompletion(session);
  const [stage, setStage] = useState<ReadingStage>(initial?.stage ?? "survey");
  const [expectations, setExpectations] = useState(initial?.expectations ?? "");
  const [questions, setQuestions] = useState<string[][]>(() => (initial?.sections ?? []).map(() => [""]));
  const [readSections, setReadSections] = useState<number[]>(initial?.readSections ?? []);
  const [sectionIndex, setSectionIndex] = useState(() => {
    const unread = (initial?.sections ?? []).findIndex((_, index) => !(initial?.readSections ?? []).includes(index));
    return unread === -1 ? 0 : unread;
  });
  const [summaryText, setSummaryText] = useState("");
  const [summaryResult, setSummaryResult] = useState<ReadingSummaryResult | null>(() => {
    const done = session.items.find((item) => item.format === "summary" && item.answered_at);
    if (!done) return null;
    const ungraded = ungradedView(done.analysis);
    return { itemId: done.id, comparison: ungraded ? null : (done.analysis as unknown as BlurtComparison), ungraded };
  });
  const [reread, setReread] = useState<number | null>(null);
  const answeredItems = useAnsweredItems(session.items);
  const shownAt = useRef<number>(0);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [stage]);

  if (summary) {
    return <RunnerSummary methodName={methodName} summary={summary} stoppedEarly={stoppedEarly} parentSessionId={parentSessionId} parentLabel={parentLabel} />;
  }
  if (!initial) return <Alert tone="error">This reading session has no sections.</Alert>;
  const state = initial;
  const labels = READING_STAGE_LABEL[method];
  const questionItems = session.items.filter((item) => item.kind === "stage" && item.format === "question");
  const reflectItems = session.items.filter((item) => item.kind === "stage" && item.format === "reflect");
  const answeredCount = answeredItems.answered;

  const advance = (to: ReadingStage, payload: { expectations?: string; questions?: Array<{ section: number; question: string }> } = {}) => {
    setError(null);
    startTransition(async () => {
      const result = await advanceReadingAction({ sessionId: session.id, to, ...payload });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setStage(result.data.stage);
      router.refresh();
    });
  };

  const markRead = (section: number) => {
    setError(null);
    startTransition(async () => {
      const result = await markSectionReadAction({ sessionId: session.id, section });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setReadSections(result.data.readSections);
      if (section + 1 < state.sections.length) setSectionIndex(section + 1);
    });
  };

  const submitSummary = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitReadingSummaryAction({ sessionId: session.id, summary: summaryText, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSummaryResult(result.data);
      answeredItems.markAnswered(result.data.itemId);
      setStage("done");
    });
  };

  const writtenQuestions = questions.flatMap((list, section) => list.map((question) => ({ section, question: question.trim() }))).filter((entry) => entry.question.length >= 5);
  const afterRead: ReadingStage = method === "pq4r" ? "reflect" : "recite";

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={stage === "done" ? "review done" : `${labels[stage as Exclude<ReadingStage, "done">]} stage`}
        onEnd={() => finish(answeredCount === 0)}
        ending={ending}
        endLabel={answeredCount === 0 ? "Stop" : "End & summarize"}
      />
      <Stepper method={method} stage={stage} />
      {error && <Alert tone="error">{error}</Alert>}

      {stage === "survey" && (
        <Panel title={`${labels.survey} the chapter`} icon={Eye} intro="Skim before you read: the outline, the main idea and the key concepts. It gives your reading a map.">
          {state.survey.summary && <p className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed">{state.survey.summary}</p>}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outline</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm">
              {state.sections.map((section) => (
                <li key={section.heading}>{section.heading}</li>
              ))}
            </ol>
          </div>
          {state.survey.concepts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {state.survey.concepts.map((concept) => (
                <Badge key={concept} tone="primary">
                  {concept}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reading-expectations" className="text-sm font-medium">
              What do you expect to learn? (optional)
            </label>
            <Textarea id="reading-expectations" rows={2} maxLength={1000} value={expectations} disabled={pending} onChange={(event) => setExpectations(event.target.value)} />
          </div>
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="button" size="sm" loading={pending} onClick={() => advance("question", { expectations })}>
              Next: {labels.question}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </Panel>
      )}

      {stage === "question" && (
        <Panel title="Turn headings into questions" icon={Lightbulb} intro="Write the questions each section should answer. You will read to answer them, then answer them from memory.">
          <ol className="flex flex-col gap-4">
            {state.sections.map((section, sectionIndexValue) => (
              <li key={section.heading} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <p className="font-medium">{section.heading}</p>
                {questions[sectionIndexValue].map((question, questionIndex) => (
                  <div key={questionIndex} className="flex items-center gap-2">
                    <Input
                      aria-label={`Question ${questionIndex + 1} for ${section.heading}`}
                      value={question}
                      maxLength={300}
                      disabled={pending}
                      placeholder={suggestQuestion(section.heading, questionIndex)}
                      onChange={(event) => setQuestions((state) => state.map((list, index) => (index === sectionIndexValue ? list.map((entry, inner) => (inner === questionIndex ? event.target.value : entry)) : list)))}
                    />
                    {questions[sectionIndexValue].length > 1 && (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove question ${questionIndex + 1} for ${section.heading}`} onClick={() => setQuestions((state) => state.map((list, index) => (index === sectionIndexValue ? list.filter((_, inner) => inner !== questionIndex) : list)))}>
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      setQuestions((state) =>
                        state.map((list, index) => {
                          if (index !== sectionIndexValue) return list;
                          const empty = list.findIndex((entry) => !entry.trim());
                          const suggestion = suggestQuestion(section.heading, empty === -1 ? list.length : empty);
                          if (empty !== -1) return list.map((entry, inner) => (inner === empty ? suggestion : entry));
                          return list.length < MAX_QUESTIONS_PER_SECTION ? [...list, suggestion] : list;
                        }),
                      )
                    }
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Suggest a question
                  </Button>
                  {questions[sectionIndexValue].length < MAX_QUESTIONS_PER_SECTION && (
                    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setQuestions((state) => state.map((list, index) => (index === sectionIndexValue ? [...list, ""] : list)))}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add another
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {pending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden="true" />
              Finding the answers in your material…
            </p>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">{writtenQuestions.length} question{writtenQuestions.length === 1 ? "" : "s"}</span>
            <Button type="button" size="sm" loading={pending} disabled={writtenQuestions.length === 0} onClick={() => advance("read", { questions: writtenQuestions })}>
              Next: {labels.read}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </Panel>
      )}

      {stage === "read" && (
        <Panel title={`Read: ${state.sections[sectionIndex]?.heading ?? ""}`} icon={BookOpenCheck} intro={`Section ${sectionIndex + 1} of ${state.sections.length}. Read actively — look for the answers to your questions.`}>
          {questionItems.filter((item) => (item.analysis as { section?: number } | null)?.section === sectionIndex).length > 0 && (
            <div className="rounded-lg bg-primary-soft/40 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Read to answer</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {questionItems
                  .filter((item) => (item.analysis as { section?: number } | null)?.section === sectionIndex)
                  .map((item) => (
                    <li key={item.id}>{item.prompt}</li>
                  ))}
              </ul>
            </div>
          )}
          <SectionText text={state.sections[sectionIndex]?.text ?? ""} />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground" role="status">
              {readSections.length} of {state.sections.length} sections read
            </span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={sectionIndex === 0} onClick={() => setSectionIndex(sectionIndex - 1)}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </Button>
              {!readSections.includes(sectionIndex) ? (
                <Button type="button" size="sm" loading={pending} onClick={() => markRead(sectionIndex)}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Mark as read
                </Button>
              ) : sectionIndex + 1 < state.sections.length ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setSectionIndex(sectionIndex + 1)}>
                  Next section
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
              {readSections.length === state.sections.length && (
                <Button type="button" size="sm" loading={pending} onClick={() => advance(afterRead)}>
                  Next: {labels[afterRead as "reflect" | "recite"]}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
          {pending && method === "pq4r" && readSections.length === state.sections.length && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden="true" />
              Writing reflection questions…
            </p>
          )}
        </Panel>
      )}

      {stage === "reflect" && (
        <Panel title="Reflect" icon={Lightbulb} intro="Think about why and how — connect what you read to the rest of the material and to what you already know.">
          {reflectItems.length > 0 ? <AnswerStep key="reflect" items={reflectItems} label="Reflect" sections={state.sections} doneLabel={`Next: ${labels.recite}`} onDone={() => advance("recite")} onAnswered={answeredItems.markAnswered} /> : <p className="text-sm text-muted-foreground">Preparing questions…</p>}
        </Panel>
      )}

      {stage === "recite" && (
        <Panel title="Recite from memory" icon={ListChecks} intro="The text is hidden. Answer your own questions out of your head, then compare.">
          {questionItems.length > 0 ? <AnswerStep key="recite" items={questionItems} label="Recite" sections={state.sections} doneLabel={`Next: ${labels.review}`} onDone={() => advance("review")} onAnswered={answeredItems.markAnswered} /> : <p className="text-sm text-muted-foreground">Loading your questions…</p>}
        </Panel>
      )}

      {(stage === "review" || stage === "done") && (
        <Panel title="Review" icon={ListChecks} intro="See what stuck, re-read what did not, and summarize the chapter in your own words.">
          <ul className="flex flex-col gap-1.5 text-sm">
            {questionItems.map((item) => {
              const section = (item.analysis as { section?: number } | null)?.section ?? 0;
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={item.is_correct ? "success" : "danger"}>{item.is_correct ? "Recalled" : "Missed"}</Badge>
                  <span>{item.prompt}</span>
                  {!item.is_correct && (
                    <Button type="button" variant="link" size="sm" onClick={() => setReread(reread === section ? null : section)}>
                      {reread === section ? "Hide" : `Re-read ${state.sections[section]?.heading ?? "the section"}`}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {reread !== null && state.sections[reread] && (
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="mb-1 text-sm font-medium">{state.sections[reread].heading}</p>
              <SectionText text={state.sections[reread].text} />
            </div>
          )}
          {!summaryResult ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="reading-summary" className="text-sm font-medium">
                  Summarize the chapter without looking
                </label>
                <Textarea id="reading-summary" rows={5} maxLength={6000} value={summaryText} disabled={pending} onChange={(event) => setSummaryText(event.target.value)} />
              </div>
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="button" size="sm" loading={pending} disabled={summaryText.trim().length < 10} onClick={submitSummary}>
                  {!pending && <Check className="h-4 w-4" aria-hidden="true" />}
                  Check my summary
                </Button>
              </div>
            </>
          ) : (
            <>
              {summaryResult.comparison ? (
                <>
                  <VerdictBox score={summaryResult.comparison.score} passAt={PASS_SCORE.recall}>
                    <p className="mt-2">{summaryResult.comparison.feedback}</p>
                  </VerdictBox>
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <PointList title="In your summary" items={summaryResult.comparison.remembered} tone="success" />
                    <PointList title="Left out" items={summaryResult.comparison.missing} tone="danger" />
                  </div>
                </>
              ) : (
                <UngradedCheck itemId={summaryResult.itemId} initial={summaryResult.ungraded?.selfCheck ?? null} against="the sections above" />
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                {session.material_id ? <ScheduleReviewsButton materialId={session.material_id} variant="secondary" size="sm" /> : <span />}
                <Button type="button" size="sm" loading={ending} onClick={() => finish()}>
                  Finish session
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
