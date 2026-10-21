"use client";

import { HelpCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { SessionHeader } from "@/components/study/session-header";
import { SessionSummaryCard } from "@/components/study/session-summary";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { routes } from "@/lib/routes";
import { completeSessionAction, evaluateQuestionAction } from "@/lib/study/actions";
import type { EvaluatedQuestion } from "@/lib/study/advanced";
import type { SessionDetail } from "@/lib/study/queries";
import type { SessionSummary } from "@/lib/study/sessions";
import { cn } from "@/lib/utils";

function storedQuestions(session: SessionDetail): EvaluatedQuestion[] {
  return session.items
    .filter((item) => item.kind === "question" && item.analysis)
    .map((item) => ({ itemId: item.id, question: item.prompt, expectedAnswer: item.response, evaluation: item.analysis as unknown as EvaluatedQuestion["evaluation"] }));
}

function scoreTone(value: number): BadgeTone {
  return value >= 80 ? "success" : value >= 60 ? "primary" : value >= 40 ? "warning" : "danger";
}

/**
 * Question generation: the student writes exam-style questions (and the
 * answer they expect); RevTaw rates relevance, clarity, difficulty and
 * accuracy and suggests an improved version.
 */
export function QuestionGenRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to Tamari's plan" }: { session: SessionDetail; methodName: string; parentSessionId?: string | null; parentLabel?: string }) {
  const router = useRouter();
  const target = Number((session.state as { target?: number } | null)?.target ?? 5);
  const [questions, setQuestions] = useState<EvaluatedQuestion[]>(() => storedQuestions(session));
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [pending, startTransition] = useTransition();
  const [ending, setEnding] = useState(false);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, [questions.length]);

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

  const evaluate = () => {
    setError(null);
    startTransition(async () => {
      const result = await evaluateQuestionAction({ sessionId: session.id, question: question.trim(), expectedAnswer: answer.trim() || null, responseMs: Math.min(86_400_000, Date.now() - startedAt.current) });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setQuestions((state) => [...state, result.data]);
      setQuestion("");
      setAnswer("");
    });
  };

  if (summary) {
    const stored = summary.extra?.averageQuality;
    const average = typeof stored === "number" ? stored : questions.length ? Math.round(questions.reduce((sum, entry) => sum + entry.evaluation.overall, 0) / questions.length) : null;
    return (
      <SessionSummaryCard
        title={`${methodName} complete`}
        summary={summary}
        extraStats={[{ label: "Average quality", value: average === null ? "—" : `${average}%` }]}
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

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`${questions.length} of ${target} questions`}
        onEnd={() => finish(questions.length === 0)}
        ending={ending}
        endLabel={questions.length === 0 ? "Stop" : "Finish & summarize"}
      />
      {error && <Alert tone="error">{error}</Alert>}

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <section aria-labelledby="question-gen-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <h2 id="question-gen-heading" className="flex items-center gap-2 text-lg font-medium">
            <HelpCircle className="h-5 w-5 text-primary" aria-hidden="true" />
            Write a question an examiner could ask
          </h2>
          <p className="text-sm text-muted-foreground">Aim for questions with one defensible answer that test something the material actually covers. Add the answer you expect so RevTaw can check it.</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="student-question" className="text-sm font-medium">
              Your question
            </label>
            <Input id="student-question" value={question} maxLength={1000} disabled={pending} placeholder="e.g. Why does the Calvin cycle depend on the light reactions?" onChange={(event) => setQuestion(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="student-answer" className="text-sm font-medium">
              Expected answer (optional)
            </label>
            <Textarea id="student-answer" rows={3} maxLength={2000} value={answer} disabled={pending} placeholder="What a full-marks answer would say." onChange={(event) => setAnswer(event.target.value)} />
          </div>
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="button" size="sm" loading={pending} onClick={evaluate} disabled={question.trim().length < 5}>
              {!pending && <Sparkles className="h-4 w-4" aria-hidden="true" />}
              Evaluate question
            </Button>
          </div>
        </section>

        {questions.length > 0 && (
          <section aria-label="Evaluated questions" className="flex flex-col gap-3">
            {[...questions].reverse().map((entry, reverseIndex) => {
              const number = questions.length - reverseIndex;
              const evaluation = entry.evaluation;
              return (
                <article key={entry.itemId} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">
                      {number}. {entry.question}
                    </p>
                    <Badge tone={scoreTone(evaluation.overall)}>{Math.round(evaluation.overall)}% overall</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge tone={scoreTone(evaluation.relevance)}>Relevance {Math.round(evaluation.relevance)}</Badge>
                    <Badge tone={scoreTone(evaluation.clarity)}>Clarity {Math.round(evaluation.clarity)}</Badge>
                    <Badge tone={scoreTone(evaluation.accuracy)}>Accuracy {Math.round(evaluation.accuracy)}</Badge>
                    <Badge tone="neutral">{evaluation.difficulty}</Badge>
                    <Badge tone="neutral">{evaluation.concept}</Badge>
                  </div>
                  <p className="text-sm">{evaluation.feedback}</p>
                  {evaluation.improved_question !== entry.question && (
                    <p className={cn("rounded-lg bg-primary-soft/50 p-3 text-sm")}>
                      <span className="text-xs font-semibold uppercase tracking-wide text-primary">Improved version</span>
                      <br />
                      {evaluation.improved_question}
                    </p>
                  )}
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">Model answer from the material</summary>
                    <p className="mt-1 whitespace-pre-wrap">{evaluation.model_answer}</p>
                  </details>
                </article>
              );
            })}
          </section>
        )}

        {questions.length >= target && (
          <div className="flex justify-end">
            <Button type="button" onClick={() => finish()} loading={ending}>
              Finish &amp; summarize
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
