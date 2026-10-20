"use client";

import { ArrowRight, Check, ChevronsDown, ListOrdered, Lightbulb, PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/forms/form-alert";
import { PointList, RunnerDone, RunnerSummary, useSessionCompletion, VerdictBox, type RunnerProps } from "@/components/study/runner-kit";
import { SessionHeader } from "@/components/study/session-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import type { ProblemAnalysis, ProblemResult } from "@/lib/study/flows/problems";
import { evaluateProblemAction, saveItemDraftAction } from "@/lib/study/method-actions";
import { fadeLabel, PROBLEM_DIFFICULTY_LABEL, readSolution, type ProblemDifficulty, type SolutionView } from "@/lib/study/problem-options";
import type { SessionDetail } from "@/lib/study/queries";

type Item = SessionDetail["items"][number];

function analysisOf(item: Item | undefined): ProblemAnalysis {
  return ((item?.analysis as ProblemAnalysis | null) ?? {}) as ProblemAnalysis;
}

function storedResults(items: Item[]): Record<string, ProblemResult> {
  return Object.fromEntries(
    items
      .filter((item) => item.answered_at && analysisOf(item).evaluation)
      .map((item) => [item.id, { evaluation: analysisOf(item).evaluation!, solution: readSolution(item.model_answer), isCorrect: Boolean(item.is_correct), heldNext: false } as ProblemResult]),
  );
}

function StepList({ steps, given = 0, start = 0 }: { steps: SolutionView["steps"]; given?: number; start?: number }) {
  return (
    <ol className="flex flex-col gap-2" start={start + 1}>
      {steps.map((step, index) => (
        <li key={`${index}-${step.step}`} className="rounded-lg border border-border bg-background p-3 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className="text-muted-foreground">Step {start + index + 1}</span>
            {index + start < given && <Badge tone="neutral">given</Badge>}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{step.step}</p>
          {step.explanation && <p className="mt-1 text-muted-foreground">Why: {step.explanation}</p>}
        </li>
      ))}
    </ol>
  );
}

/**
 * Worked examples, faded worked examples and practice problems (§16).
 * Worked: study the example step by step, then solve a similar problem.
 * Faded: the first steps are given (fewer each time); write the rest.
 * Practice: solve, then see the solution, every step's reason and any
 * alternative approach. The reasoning is graded, not only the answer.
 */
export function ProblemRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to smart session" }: RunnerProps) {
  const router = useRouter();
  const items = session.items;
  const { summary, stoppedEarly, ending, error, setError, finish, pending, startTransition } = useSessionCompletion(session);
  const [index, setIndex] = useState(() => {
    const first = items.findIndex((entry) => !entry.answered_at);
    return first === -1 ? items.length : first;
  });
  const item = items[index];
  const [stage, setStage] = useState<"example" | "solve">(() => (analysisOf(item).worked && !item?.response ? "example" : "solve"));
  const [shownSteps, setShownSteps] = useState(1);
  const [work, setWork] = useState(() => item?.response ?? "");
  const [results, setResults] = useState<Record<string, ProblemResult>>(() => storedResults(items));
  const [heldNotice, setHeldNotice] = useState(false);
  const shownAt = useRef<number>(0);
  const savedDraft = useRef<string>("");

  useEffect(() => {
    shownAt.current = Date.now();
    savedDraft.current = item?.response ?? "";
  }, [item?.id, item?.response]);

  if (summary) {
    return <RunnerSummary methodName={methodName} summary={summary} stoppedEarly={stoppedEarly} parentSessionId={parentSessionId} parentLabel={parentLabel} />;
  }
  if (!item) return <RunnerDone session={session} methodName={methodName} message="Every problem is done." ending={ending} onFinish={() => finish()} />;

  const analysis = analysisOf(item);
  const result = results[item.id];
  const answered = Object.keys(results).length;
  const worked = analysis.worked ?? null;
  const faded = analysis.faded ?? null;
  const fade = fadeLabel(item.format);
  const difficulty = analysis.difficulty ?? (item.format && item.format in PROBLEM_DIFFICULTY_LABEL ? (item.format as ProblemDifficulty) : null);

  const saveDraft = () => {
    if (result || work === savedDraft.current) return;
    savedDraft.current = work;
    void saveItemDraftAction({ itemId: item.id, draft: work });
  };

  const check = () => {
    setError(null);
    startTransition(async () => {
      const response = await evaluateProblemAction({ itemId: item.id, work, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setResults((state) => ({ ...state, [item.id]: response.data }));
      setHeldNotice(response.data.heldNext);
      // The next faded example changed on the server (same help as this one): reload the items.
      if (response.data.heldNext) router.refresh();
    });
  };

  const next = () => {
    if (index + 1 >= items.length) {
      finish();
      return;
    }
    const upcoming = items[index + 1];
    setIndex(index + 1);
    setWork(upcoming.response ?? "");
    setStage(analysisOf(upcoming).worked && !upcoming.response ? "example" : "solve");
    setShownSteps(1);
  };

  const workedSteps = worked?.solution.steps ?? [];
  const allShown = shownSteps >= workedSteps.length;
  const placeholder = faded ? (faded.givenSteps.length ? `Continue from step ${faded.givenSteps.length + 1}: write the remaining steps and the final answer.` : "Solve it on your own: write every step and the final answer.") : "Write your working step by step, then the final answer.";

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`problem ${index + 1} of ${items.length}`}
        onEnd={() => finish(answered === 0)}
        ending={ending}
        endLabel={answered === 0 ? "Stop" : "End & summarize"}
      />
      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="problem-heading" className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {worked && <Badge tone="neutral">{stage === "example" ? "Worked example" : "Your turn"}</Badge>}
          {fade && <Badge tone="neutral">{fade}</Badge>}
          {!worked && !faded && difficulty && <Badge tone="neutral">{PROBLEM_DIFFICULTY_LABEL[difficulty]}</Badge>}
          {item.concept && <Badge tone="primary">{item.concept.name}</Badge>}
        </div>

        {stage === "example" && worked ? (
          <>
            <h2 id="problem-heading" className="flex items-center gap-2 text-lg font-medium">
              <ListOrdered className="h-5 w-5 text-primary" aria-hidden="true" />
              Worked example
            </h2>
            <p className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-[15px] leading-relaxed">{worked.problem}</p>
            <StepList steps={workedSteps.slice(0, shownSteps)} />
            {allShown ? (
              <>
                <div className="rounded-lg bg-success-soft/50 p-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Final answer</p>
                  <p className="mt-1 whitespace-pre-wrap font-medium">{worked.solution.final_answer}</p>
                </div>
                <div className="flex justify-end border-t border-border pt-4">
                  <Button type="button" size="sm" onClick={() => setStage("solve")}>
                    Try a similar problem
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShownSteps(workedSteps.length)}>
                  <ChevronsDown className="h-4 w-4" aria-hidden="true" />
                  Show all steps
                </Button>
                <Button type="button" size="sm" onClick={() => setShownSteps(shownSteps + 1)}>
                  Show next step
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 id="problem-heading" className="flex items-center gap-2 text-lg font-medium">
              <PencilLine className="h-5 w-5 text-primary" aria-hidden="true" />
              {worked ? "Your turn: a similar problem" : faded ? (faded.givenSteps.length ? "Complete the solution" : "Solve it on your own") : "Problem"}
            </h2>
            <p id="problem-prompt" className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-[15px] leading-relaxed">
              {item.prompt}
            </p>
            {faded && faded.givenSteps.length > 0 && !result && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  The first {faded.givenSteps.length} of {faded.totalSteps} steps are done for you. Write steps {faded.givenSteps.length + 1}–{faded.totalSteps} and the final answer.
                  {faded.held ? " You get the same amount of help as last time." : ""}
                </p>
                <StepList steps={faded.givenSteps.map((step) => ({ step: step.step, explanation: step.explanation }))} given={faded.givenSteps.length} />
              </div>
            )}
            {!result ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="problem-work" className="text-sm font-medium">
                    Your working
                  </label>
                  <Textarea id="problem-work" rows={8} maxLength={8000} value={work} disabled={pending} placeholder={placeholder} onChange={(event) => setWork(event.target.value)} onBlur={saveDraft} />
                </div>
                <div className="flex justify-end border-t border-border pt-4">
                  <Button type="button" size="sm" loading={pending} disabled={work.trim().length < 2} onClick={check}>
                    {!pending && <Check className="h-4 w-4" aria-hidden="true" />}
                    Check my working
                  </Button>
                </div>
              </>
            ) : (
              <>
                <VerdictBox verdict={result.evaluation.verdict} score={result.evaluation.score}>
                  <p className="mt-2">{result.evaluation.feedback}</p>
                  <p className="mt-2 text-muted-foreground">Final answer: {result.evaluation.final_answer_correct ? "matches the solution." : "does not match the solution yet."}</p>
                </VerdictBox>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <PointList title="What you got right" items={result.evaluation.correct_steps} tone="success" />
                  <PointList title="Where it went wrong" items={result.evaluation.errors.map((entry) => `${entry.step} — ${entry.issue}`)} tone="danger" />
                </div>
                {result.solution && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Solution</p>
                    <StepList steps={result.solution.steps} given={faded?.givenSteps.length ?? 0} />
                    <div className="rounded-lg bg-success-soft/50 p-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Final answer</p>
                      <p className="mt-1 whitespace-pre-wrap font-medium">{result.solution.final_answer}</p>
                    </div>
                    {result.solution.alternative_approach && (
                      <div className="rounded-lg bg-primary-soft/40 p-3 text-sm">
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                          <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
                          Alternative approach
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{result.solution.alternative_approach}</p>
                      </div>
                    )}
                  </div>
                )}
                {heldNotice && <p className="text-sm text-muted-foreground">That one was tough, so the next example keeps the same amount of help.</p>}
                <div className="flex justify-end border-t border-border pt-4">
                  <Button type="button" size="sm" onClick={next} loading={ending}>
                    {index + 1 >= items.length ? "Finish session" : "Next problem"}
                    {!ending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
