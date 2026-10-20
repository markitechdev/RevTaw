"use client";

import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleX, Flag, TimerIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { QuestionInput } from "@/components/quizzes/question-input";
import { Alert } from "@/components/forms/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { answerQuestionAction, submitAttemptAction } from "@/lib/quizzes/actions";
import type { AttemptRunnerView } from "@/lib/quizzes/queries";
import type { AnswerFeedback } from "@/lib/quizzes/service";
import { CONFIDENCE_LEVELS, DIFFICULTY_LABEL, QUESTION_TYPE_BY_ID, QUIZ_MODE_LABEL, type QuestionResponse } from "@/lib/quizzes/types";
import type { ConfidenceLevel } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type SavedState = { graded: boolean; isCorrect: boolean | null };

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function sameResponse(a: QuestionResponse | null, b: QuestionResponse | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * The attempt runner. Answers are saved on the server one question at a time
 * (so a refresh or a dropped connection loses at most the current question),
 * graded immediately in practice mode when the quiz allows it, and the whole
 * attempt is submitted at the end or when the timer runs out.
 */
export function QuizRunner({ view }: { view: AttemptRunnerView }) {
  const router = useRouter();
  const { attempt, quiz, questions, deadline } = view;
  const immediate = attempt.mode === "practice" && quiz.config.feedback === "immediate";

  const [index, setIndex] = useState(() => {
    const firstUnanswered = questions.findIndex((question) => !view.answers.some((answer) => answer.questionId === question.id && answer.response));
    return firstUnanswered === -1 ? 0 : firstUnanswered;
  });
  const [responses, setResponses] = useState<Record<string, QuestionResponse | null>>(() =>
    Object.fromEntries(view.answers.map((answer) => [answer.questionId, answer.response])),
  );
  const [confidence, setConfidence] = useState<Record<string, ConfidenceLevel | null>>(() =>
    Object.fromEntries(view.answers.map((answer) => [answer.questionId, answer.confidence])),
  );
  const [saved, setSaved] = useState<Record<string, SavedState>>(() =>
    Object.fromEntries(view.answers.filter((answer) => answer.response).map((answer) => [answer.questionId, { graded: answer.graded, isCorrect: answer.isCorrect }])),
  );
  const [feedback, setFeedback] = useState<Record<string, AnswerFeedback>>({});
  const [persisted, setPersisted] = useState<Record<string, QuestionResponse | null>>(() =>
    Object.fromEntries(view.answers.map((answer) => [answer.questionId, answer.response])),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState<number | null>(() => (deadline ? Math.round((new Date(deadline).getTime() - Date.now()) / 1000) : null));

  const shownAt = useRef<number>(0);
  const elapsed = useRef<Record<string, number>>({});
  const submittedRef = useRef(false);

  const question = questions[index];
  const current = responses[question.id] ?? null;
  const checked = immediate && Boolean(saved[question.id]);
  const answeredCount = questions.filter((item) => persisted[item.id]).length;

  // Track time spent per question.
  useEffect(() => {
    const timings = elapsed.current;
    shownAt.current = Date.now();
    return () => {
      timings[question.id] = (timings[question.id] ?? 0) + (Date.now() - shownAt.current);
    };
  }, [question.id]);

  const responseMsFor = (questionId: string) => Math.min(86_400_000, (elapsed.current[questionId] ?? 0) + (questionId === question.id ? Date.now() - shownAt.current : 0));

  const persist = useCallback(
    async (questionId: string, options: { force?: boolean } = {}): Promise<boolean> => {
      const response = responses[questionId] ?? null;
      if (!options.force && sameResponse(response, persisted[questionId] ?? null)) return true;
      if (!response && !persisted[questionId]) return true;
      const result = await answerQuestionAction({
        attemptId: attempt.id,
        questionId,
        response,
        confidence: confidence[questionId] ?? null,
        responseMs: responseMsFor(questionId),
      });
      if (!result.ok) {
        setError(result.message);
        return false;
      }
      setPersisted((state) => ({ ...state, [questionId]: response }));
      if (response) {
        setSaved((state) => ({
          ...state,
          [questionId]: { graded: result.data.feedback?.graded ?? false, isCorrect: result.data.feedback?.isCorrect ?? null },
        }));
      }
      if (result.data.feedback) setFeedback((state) => ({ ...state, [questionId]: result.data.feedback! }));
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [responses, persisted, confidence, attempt.id, question.id],
  );

  const submit = useCallback(
    (auto = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      setConfirmOpen(false);
      startTransition(async () => {
        setError(null);
        await persist(question.id).catch(() => false);
        const result = await submitAttemptAction({ attemptId: attempt.id, quizId: quiz.id });
        if (!result.ok) {
          submittedRef.current = false;
          setSubmitting(false);
          setError(auto ? `Time is up, but the quiz could not be submitted automatically: ${result.message}` : result.message);
          return;
        }
        router.refresh();
      });
    },
    [attempt.id, quiz.id, persist, question.id, router],
  );

  // Countdown and auto-submit.
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const seconds = Math.round((new Date(deadline).getTime() - Date.now()) / 1000);
      setRemaining(seconds);
      if (seconds <= 0) submit(true);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadline, submit]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const dirty = Object.keys(responses).some((id) => !sameResponse(responses[id] ?? null, persisted[id] ?? null));
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [responses, persisted]);

  const goTo = (nextIndex: number) => {
    setError(null);
    startTransition(async () => {
      const ok = await persist(question.id);
      if (ok) setIndex(Math.max(0, Math.min(questions.length - 1, nextIndex)));
    });
  };

  const check = () => {
    setError(null);
    if (!current) {
      setError("Answer the question first, or skip it with Next.");
      return;
    }
    startTransition(async () => {
      await persist(question.id, { force: true });
    });
  };

  const finish = () => {
    setError(null);
    startTransition(async () => {
      const ok = await persist(question.id);
      if (!ok) return;
      const unanswered = questions.filter((item) => !(item.id === question.id ? current : persisted[item.id])).length;
      if (unanswered > 0) setConfirmOpen(true);
      else submit();
    });
  };

  const info = QUESTION_TYPE_BY_ID[question.type];
  const currentFeedback = feedback[question.id];
  const lowTime = remaining !== null && remaining <= 60;
  const unansweredCount = questions.filter((item) => !(item.id === question.id ? current : persisted[item.id])).length;

  const navigator = useMemo(
    () => (
      <ol className="flex flex-wrap gap-1.5" aria-label="Questions">
        {questions.map((item, position) => {
          const state = saved[item.id];
          const answered = Boolean(item.id === question.id ? current : persisted[item.id]);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => goTo(position)}
                aria-current={position === index ? "step" : undefined}
                aria-label={`Question ${position + 1}${answered ? ", answered" : ""}`}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors",
                  position === index ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                  position !== index && answered && "border-primary/40 bg-primary-soft text-primary",
                  position !== index && immediate && state?.graded && state.isCorrect === true && "border-success/40 bg-success-soft text-success",
                  position !== index && immediate && state?.graded && state.isCorrect === false && "border-danger/40 bg-danger-soft text-danger",
                )}
              >
                {position + 1}
              </button>
            </li>
          );
        })}
      </ol>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, saved, persisted, current, index, immediate],
  );

  if (submitting) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center" role="status">
        <Check className="h-8 w-8 animate-pulse text-primary" aria-hidden="true" />
        <p className="font-medium">Scoring your answers…</p>
        <p className="text-sm text-muted-foreground">Open-ended answers are compared with the model answer. This takes a few seconds.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 id="quiz-runner-title" className="sr-only">
        {quiz.title}
      </h1>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <Badge tone={attempt.mode === "exam" ? "warning" : "primary"}>{QUIZ_MODE_LABEL[attempt.mode]}</Badge>
          <span className="font-medium">
            Question {index + 1} of {questions.length}
          </span>
          <span className="text-muted-foreground">· {answeredCount} answered</span>
        </div>
        <div className="flex items-center gap-3">
          {remaining !== null && (
            <span
              className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-sm tabular-nums", lowTime ? "bg-danger-soft text-danger" : "bg-muted text-foreground")}
              role="timer"
              aria-live={lowTime ? "assertive" : "off"}
              aria-label={`Time remaining ${formatClock(remaining)}`}
            >
              <TimerIcon className="h-4 w-4" aria-hidden="true" />
              {formatClock(remaining)}
            </span>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={finish} disabled={pending}>
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            Finish quiz
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_16rem]">
        <section aria-labelledby="question-heading" className={cn("rounded-xl border border-border bg-card p-5", pending && "opacity-80")}>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="neutral">{info.name}</Badge>
            <Badge tone="neutral">{DIFFICULTY_LABEL[question.difficulty]}</Badge>
            <span className="text-muted-foreground">
              {question.points} {question.points === 1 ? "point" : "points"}
            </span>
          </div>
          <h2 id="question-heading" className="whitespace-pre-wrap text-lg font-medium leading-snug text-foreground">
            {question.prompt}
          </h2>

          <div className="mt-5">
            <QuestionInput
              question={question}
              value={current}
              disabled={checked || pending}
              onChange={(value) => setResponses((state) => ({ ...state, [question.id]: value }))}
            />
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">How sure are you?</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Confidence">
              {CONFIDENCE_LEVELS.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  disabled={checked || pending}
                  aria-pressed={confidence[question.id] === level.id}
                  onClick={() => setConfidence((state) => ({ ...state, [question.id]: state[question.id] === level.id ? null : level.id }))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    confidence[question.id] === level.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}

          {currentFeedback && (
            <div
              className={cn(
                "mt-4 rounded-lg border p-4 text-sm",
                currentFeedback.isCorrect === true && "border-success/40 bg-success-soft/60",
                currentFeedback.isCorrect === false && "border-danger/40 bg-danger-soft/60",
                currentFeedback.isCorrect === null && "border-border bg-muted/60",
              )}
              role="status"
            >
              <p className="flex items-center gap-2 font-semibold">
                {currentFeedback.isCorrect === true ? (
                  <>
                    <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" /> Correct
                  </>
                ) : currentFeedback.isCorrect === false ? (
                  <>
                    <CircleX className="h-4 w-4 text-danger" aria-hidden="true" /> Not quite
                  </>
                ) : (
                  "Saved — this answer is checked when you finish."
                )}
                {currentFeedback.graded && currentFeedback.score !== null && currentFeedback.points > 1 && (
                  <span className="font-normal text-muted-foreground">
                    ({currentFeedback.score}/{currentFeedback.points} points)
                  </span>
                )}
              </p>
              {currentFeedback.isCorrect !== true && currentFeedback.graded && (
                <p className="mt-2">
                  <span className="font-medium">Correct answer:</span> {currentFeedback.correctAnswer}
                </p>
              )}
              {currentFeedback.feedback && <p className="mt-2">{currentFeedback.feedback}</p>}
              {currentFeedback.graded && currentFeedback.explanation && <p className="mt-2 text-muted-foreground">{currentFeedback.explanation}</p>}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" size="sm" disabled={index === 0 || pending} onClick={() => goTo(index - 1)}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </Button>
            <div className="flex gap-2">
              {immediate && !checked && (
                <Button type="button" variant="secondary" size="sm" loading={pending} onClick={check}>
                  Check answer
                </Button>
              )}
              {index < questions.length - 1 ? (
                <Button type="button" size="sm" loading={pending && !immediate} onClick={() => goTo(index + 1)}>
                  Next
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button type="button" size="sm" loading={pending && !immediate} onClick={finish}>
                  <Flag className="h-4 w-4" aria-hidden="true" />
                  Finish quiz
                </Button>
              )}
            </div>
          </div>
        </section>

        <aside aria-labelledby="quiz-runner-title" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-6 lg:self-start">
          <p className="text-sm font-semibold" aria-hidden="true">
            {quiz.title}
          </p>
          {navigator}
          <p className="text-xs text-muted-foreground">
            {attempt.mode === "exam"
              ? "Exam mode: answers are scored after you submit. Nothing is revealed before then."
              : immediate
                ? "Check each answer to see the explanation before moving on."
                : "Answers are saved as you move between questions."}
          </p>
        </aside>
      </div>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Finish with unanswered questions?">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {unansweredCount} {unansweredCount === 1 ? "question is" : "questions are"} still blank and will be marked incorrect.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              Keep answering
            </Button>
            <Button type="button" onClick={() => submit()}>
              Submit anyway
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
