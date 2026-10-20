"use client";

import { ArrowRight, Briefcase, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/forms/form-alert";
import { PointList, RunnerDone, RunnerSummary, useSessionCompletion, VerdictBox, verdictOf, type RunnerProps } from "@/components/study/runner-kit";
import { SessionHeader } from "@/components/study/session-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import type { CaseResult, CaseView } from "@/lib/study/flows/applied";
import { evaluateCaseAction, saveItemDraftAction } from "@/lib/study/method-actions";
import type { CaseAnswer, CaseField } from "@/lib/study/prompts/applied";
import type { SessionDetail } from "@/lib/study/queries";

type Item = SessionDetail["items"][number];

const FIELDS: ReadonlyArray<{ id: CaseField; label: string; hint: string; rows: number }> = [
  { id: "problem", label: "Problem", hint: "What is the core problem in this case?", rows: 3 },
  { id: "evidence", label: "Evidence", hint: "Which facts in the case point to it? One per line.", rows: 4 },
  { id: "solutions", label: "Possible solutions", hint: "What could be done? One per line.", rows: 4 },
  { id: "best_solution", label: "Best solution", hint: "Which one would you choose?", rows: 2 },
  { id: "justification", label: "Justification", hint: "Why is it the best? Use the ideas from the material.", rows: 4 },
];

const EMPTY: CaseAnswer = { problem: "", evidence: "", solutions: "", best_solution: "", justification: "" };

function viewOf(item: Item | undefined): CaseView | null {
  return (item?.analysis as { case?: CaseView } | null)?.case ?? null;
}

function answerOf(item: Item | undefined): CaseAnswer {
  if (!item?.response) return EMPTY;
  try {
    const parsed = JSON.parse(item.response) as Partial<CaseAnswer>;
    return Object.fromEntries(FIELDS.map((field) => [field.id, typeof parsed[field.id] === "string" ? parsed[field.id] : ""])) as CaseAnswer;
  } catch {
    return EMPTY;
  }
}

function storedResult(item: Item): CaseResult | null {
  const evaluation = (item.analysis as { evaluation?: CaseResult["evaluation"] } | null)?.evaluation;
  if (!item.answered_at || !evaluation || !item.model_answer) return null;
  try {
    return { evaluation, model: JSON.parse(item.model_answer) as CaseResult["model"], isCorrect: Boolean(item.is_correct) };
  } catch {
    return null;
  }
}

function tone(score: number): BadgeTone {
  return score >= 80 ? "success" : score >= 50 ? "warning" : "danger";
}

function expertText(result: CaseResult, field: CaseField): string {
  const value = result.model[field];
  return Array.isArray(value) ? value.join("; ") : value;
}

/**
 * Case-based learning (§16): a detailed case, then the student's analysis
 * — problem, evidence, possible solutions, best solution, justification —
 * scored field by field beside the expert analysis. Drafts survive a refresh.
 */
export function CaseRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to smart session" }: RunnerProps) {
  const items = session.items;
  const { summary, stoppedEarly, ending, error, setError, finish, pending, startTransition } = useSessionCompletion(session);
  const [index, setIndex] = useState(() => {
    const first = items.findIndex((entry) => !entry.answered_at);
    return first === -1 ? items.length : first;
  });
  const item = items[index];
  const [answer, setAnswer] = useState<CaseAnswer>(() => answerOf(item));
  const [results, setResults] = useState<Record<string, CaseResult>>(() => Object.fromEntries(items.map((entry) => [entry.id, storedResult(entry)] as const).filter((pair): pair is [string, CaseResult] => pair[1] !== null)));
  const shownAt = useRef<number>(0);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [item?.id]);

  if (summary) return <RunnerSummary methodName={methodName} summary={summary} stoppedEarly={stoppedEarly} parentSessionId={parentSessionId} parentLabel={parentLabel} />;
  const view = viewOf(item);
  if (!item || !view) return <RunnerDone session={session} methodName={methodName} message="Every case is analysed." ending={ending} onFinish={() => finish()} />;

  const result = results[item.id];
  const answered = Object.keys(results).length;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const response = await evaluateCaseAction({ itemId: item.id, answer, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
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
    setAnswer(answerOf(items[index + 1]));
  };

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`case ${index + 1} of ${items.length}`}
        onEnd={() => finish(answered === 0)}
        ending={ending}
        endLabel={answered === 0 ? "Stop" : "End & summarize"}
      />
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid w-full gap-4 lg:grid-cols-2">
        <section aria-labelledby="case-title" className="flex flex-col gap-3 self-start rounded-xl border border-border bg-card p-5 lg:sticky lg:top-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="neutral">
              <Briefcase className="h-3 w-3" aria-hidden="true" />
              Case
            </Badge>
            {item.concept && <Badge tone="primary">{item.concept.name}</Badge>}
          </div>
          <h2 id="case-title" className="text-lg font-medium leading-snug">
            {view.title}
          </h2>
          <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
            {view.text.split(/\n{2,}/).map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex} className="whitespace-pre-wrap">
                {paragraph}
              </p>
            ))}
          </div>
          <p className="rounded-lg bg-muted/60 p-3 text-sm font-medium">{view.task}</p>
        </section>

        <section aria-label="Your analysis" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          {!result ? (
            <>
              {FIELDS.map((field) => (
                <div key={field.id} className="flex flex-col gap-1.5">
                  <label htmlFor={`case-${field.id}`} className="text-sm font-medium">
                    {field.label}
                  </label>
                  <Textarea
                    id={`case-${field.id}`}
                    rows={field.rows}
                    maxLength={3000}
                    value={answer[field.id]}
                    disabled={pending}
                    placeholder={field.hint}
                    onChange={(event) => setAnswer({ ...answer, [field.id]: event.target.value })}
                    onBlur={() => void saveItemDraftAction({ itemId: item.id, draft: JSON.stringify(answer) })}
                  />
                </div>
              ))}
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="button" size="sm" loading={pending} disabled={answer.problem.trim().length < 3 || answer.best_solution.trim().length < 3} onClick={submit}>
                  {!pending && <Check className="h-4 w-4" aria-hidden="true" />}
                  Submit analysis
                </Button>
              </div>
            </>
          ) : (
            <>
              <VerdictBox verdict={verdictOf(result.evaluation.overall)} score={result.evaluation.overall}>
                <p className="mt-2">{result.evaluation.feedback}</p>
              </VerdictBox>
              <ul className="flex flex-col gap-3">
                {FIELDS.map((field) => (
                  <li key={field.id} className="rounded-lg border border-border p-3 text-sm">
                    <p className="flex flex-wrap items-center justify-between gap-2 font-medium">
                      {field.label}
                      <Badge tone={tone(result.evaluation.fields[field.id].score)}>{Math.round(result.evaluation.fields[field.id].score)}%</Badge>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">You: {answer[field.id] || "—"}</p>
                    <p className="mt-1 whitespace-pre-wrap">Expert: {expertText(result, field.id)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{result.evaluation.fields[field.id].feedback}</p>
                  </li>
                ))}
              </ul>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <PointList title="Strengths" items={result.evaluation.strengths} tone="success" />
                <PointList title="Gaps" items={result.evaluation.gaps} tone="danger" />
              </div>
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="button" size="sm" onClick={next} loading={ending}>
                  {index + 1 >= items.length ? "Finish session" : "Next case"}
                  {!ending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
