import { BookOpen, CircleCheck, CircleDashed, CircleHelp, CircleX, Clock, NotebookPen, Target } from "lucide-react";
import Link from "next/link";

import { promptLead, StatementPair } from "@/components/quizzes/question-prompt";
import { SelfGradeControls } from "@/components/quizzes/self-grade";
import { StartAttemptButton } from "@/components/quizzes/start-attempt";
import { AskWhyWrongButton } from "@/components/tutor/ask-why-wrong";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SECTION_TITLE } from "@/components/ui/typography";
import type { AttemptResultsView } from "@/lib/quizzes/queries";
import { CONFIDENCE_LABEL, DIFFICULTY_LABEL, optionLetter, QUESTION_TYPE_BY_ID, QUIZ_MODE_LABEL } from "@/lib/quizzes/types";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

function formatDuration(startedAt: string, submittedAt: string | null): string {
  if (!submittedAt) return "—";
  const seconds = Math.max(0, Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}

function formatResponseTime(ms: number | null): string | null {
  if (ms === null) return null;
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${seconds} s`;
}

/** Score summary plus a per-question review of a submitted attempt. */
export function AttemptResults({ view, questionCount }: { view: AttemptResultsView; questionCount: number }) {
  const { attempt, quiz, questions, conceptSummary, needsSelfCheck } = view;
  const percent = attempt.max_score ? Math.round(((attempt.score ?? 0) / attempt.max_score) * 100) : 0;
  const tone = percent >= 80 ? "success" : percent >= 60 ? "warning" : "danger";
  const weak = conceptSummary.filter((concept) => concept.correct < concept.total);
  const strong = conceptSummary.filter((concept) => concept.correct === concept.total);
  const message =
    percent >= 90
      ? "Excellent. These concepts are close to mastered — a spaced review in a few days will lock them in."
      : percent >= 70
        ? "Solid work. Review the items you missed below; their concepts are now in your mistake notebook."
        : percent >= 50
          ? "A fair start. Re-read the source sections for the concepts listed under Needs work, then retake the quiz."
          : "This material needs another pass. Open the reviewer, study the weak concepts, and try again — mistakes are expected on the first attempt.";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div
              className={cn(
                "flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full border-4",
                tone === "success" && "border-success text-success",
                tone === "warning" && "border-warning text-warning",
                tone === "danger" && "border-danger text-danger",
              )}
              aria-label={`Score ${percent} percent`}
            >
              <span className="text-3xl font-semibold tabular-nums">{percent}%</span>
              <span className="text-xs text-muted-foreground">
                {attempt.score ?? 0}/{attempt.max_score ?? 0} pts
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={attempt.mode === "exam" ? "warning" : "primary"}>{QUIZ_MODE_LABEL[attempt.mode]}</Badge>
                <span className="text-sm text-muted-foreground">
                  {attempt.correct_count ?? 0} of {attempt.question_count || questionCount} correct
                </span>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatDuration(attempt.started_at, attempt.submitted_at)}
                </span>
              </div>
              <p className="text-sm text-foreground/90">{message}</p>
              {needsSelfCheck > 0 && (
                <p className="text-sm text-warning">
                  {needsSelfCheck} open {needsSelfCheck === 1 ? "answer needs" : "answers need"} your own check below; the score updates as you mark them.
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-2">
                <StartAttemptButton quizId={quiz.id} config={quiz.config} questionCount={questionCount} size="sm">
                  Retake quiz
                </StartAttemptButton>
                <Link href={`${routes.quiz}/mistakes`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  <NotebookPen className="h-4 w-4" aria-hidden="true" />
                  Mistake notebook
                </Link>
                <Link href={`${routes.materials}/${quiz.material_id}`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  Open material
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" aria-hidden="true" />
              By concept
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {weak.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger">Needs work</p>
                <ul className="flex flex-col gap-1">
                  {weak.slice(0, 6).map((concept) => (
                    <li key={concept.id ?? concept.name} className="flex items-center justify-between gap-2">
                      <span className="truncate">{concept.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {concept.correct}/{concept.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {strong.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success">Solid</p>
                <ul className="flex flex-col gap-1">
                  {strong.slice(0, 6).map((concept) => (
                    <li key={concept.id ?? concept.name} className="flex items-center justify-between gap-2">
                      <span className="truncate">{concept.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {concept.correct}/{concept.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {conceptSummary.length === 0 && <p className="text-muted-foreground">No concept data for this attempt.</p>}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="review-heading" className="flex flex-col gap-3">
        <h2 id="review-heading" className={SECTION_TITLE}>
          Question review
        </h2>
        <ol className="flex flex-col gap-3">
          {questions.map((question) => {
            const info = QUESTION_TYPE_BY_ID[question.type];
            const ungraded = question.gradedBy === null && question.response !== null && question.answerId;
            const responseTime = formatResponseTime(question.responseMs);
            return (
              <li
                key={question.id}
                className={cn(
                  "rounded-xl border bg-card p-5",
                  question.isCorrect === true && "border-success/40",
                  question.isCorrect === false && "border-danger/40",
                  question.isCorrect === null && "border-border",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-foreground">Q{question.position + 1}</span>
                  <Badge tone="neutral">{info.name}</Badge>
                  <Badge tone="neutral">{DIFFICULTY_LABEL[question.difficulty]}</Badge>
                  {question.concept && <Badge tone="primary">{question.concept.name}</Badge>}
                  <span className="ml-auto flex items-center gap-1 font-medium">
                    {question.isCorrect === true ? (
                      <>
                        <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" /> Correct
                      </>
                    ) : question.isCorrect === false && question.response === null ? (
                      <>
                        <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Not answered
                      </>
                    ) : question.isCorrect === false ? (
                      <>
                        <CircleX className="h-4 w-4 text-danger" aria-hidden="true" /> Incorrect
                      </>
                    ) : (
                      <>
                        <CircleHelp className="h-4 w-4 text-warning" aria-hidden="true" /> Needs your check
                      </>
                    )}
                    <span className="text-muted-foreground">
                      · {question.score ?? 0}/{question.points}
                    </span>
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap font-medium leading-snug">{promptLead(question.type, question.prompt)}</p>
                <StatementPair type={question.type} prompt={question.prompt} />
                {question.options && (
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {question.options.map((option, position) => {
                      const isAnswer = "option_id" in question.answer && question.answer.option_id === option.id;
                      const isChosen = question.response && "option_id" in question.response && question.response.option_id === option.id;
                      return (
                        <li
                          key={option.id}
                          className={cn(
                            "flex gap-2 rounded-md px-2 py-1",
                            isAnswer && "bg-success-soft text-success",
                            isChosen && !isAnswer && "bg-danger-soft text-danger",
                          )}
                        >
                          <span className="font-semibold">{optionLetter(position)}.</span>
                          <span>{option.text}</span>
                          {isAnswer && <span className="sr-only">(correct answer)</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-lg bg-muted/60 p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your answer</dt>
                    <dd className="mt-1 whitespace-pre-wrap">{question.studentAnswer ?? <span className="text-muted-foreground">No answer</span>}</dd>
                  </div>
                  <div className="rounded-lg bg-success-soft/50 p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"model_answer" in question.answer ? "Model answer" : "Correct answer"}</dt>
                    <dd className="mt-1 whitespace-pre-wrap">{question.correctAnswer}</dd>
                    {"rubric" in question.answer && question.answer.rubric.length > 0 && (
                      <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
                        {question.answer.rubric.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </dl>
                {/* Tamari's or the student's own feedback; an auto-graded answer only carries a note (a near-miss spelling). */}
                {question.feedback && question.response !== null && (question.gradedBy !== "auto" || question.isCorrect === false) && <p className="mt-3 text-sm">{question.feedback}</p>}
                {question.note && (
                  <p className="mt-2 text-sm">
                    <span className="font-medium">{question.note.label}:</span> {question.note.text}
                  </p>
                )}
                {question.explanation && <p className="mt-2 text-sm text-muted-foreground">{question.explanation}</p>}
                {question.sourceExcerpt && (
                  <p className="mt-2 border-l-2 border-primary/40 pl-3 text-xs italic text-muted-foreground">Source: “{question.sourceExcerpt}”</p>
                )}
                {(question.confidence || responseTime) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {question.confidence ? `Confidence: ${CONFIDENCE_LABEL[question.confidence]}` : null}
                    {question.confidence && responseTime ? " · " : null}
                    {responseTime ? `Time: ${responseTime}` : null}
                  </p>
                )}
                {ungraded && question.answerId && (
                  <SelfGradeControls answerId={question.answerId} quizId={quiz.id} attemptId={attempt.id} points={question.points} />
                )}
                {question.isCorrect === false && (
                  <div className="mt-3">
                    <AskWhyWrongButton materialId={quiz.material_id} question={question.prompt} options={question.options} studentAnswer={question.studentAnswer} correctAnswer={question.correctAnswer} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
