import { ArrowLeft, Clock, History, Shuffle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatRelativeDate } from "@/components/materials/material-card";
import { ExportMenu } from "@/components/export/export-menu";
import { QuizActions } from "@/components/quizzes/quiz-actions";
import { StartAttemptButton } from "@/components/quizzes/start-attempt";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { GeneratingState } from "@/components/ui/generating-state";
import { PAGE_TITLE } from "@/components/ui/typography";
import { getQuiz } from "@/lib/quizzes/queries";
import { DIFFICULTY_LABEL, QUESTION_TYPE_BY_ID, QUIZ_MODE_LABEL } from "@/lib/quizzes/types";
import { routes } from "@/lib/routes";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const quiz = await getQuiz(id);
  return { title: quiz?.title ?? "Quiz" };
}

export default async function QuizDetailPage({ params }: PageProps<"/quiz/[id]">) {
  const { id } = await params;
  const quiz = await getQuiz(id);
  if (!quiz) notFound();

  const inProgress = quiz.attempts.find((attempt) => attempt.status === "in_progress");
  const submitted = quiz.attempts.filter((attempt) => attempt.status === "submitted");
  const best = submitted.reduce<number | null>((max, attempt) => {
    const percent = attempt.max_score ? Math.round(((attempt.score ?? 0) / attempt.max_score) * 100) : 0;
    return max === null || percent > max ? percent : max;
  }, null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href={routes.quiz} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Quizzes
        </Link>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={quiz.config.mode === "exam" ? "warning" : "primary"}>{QUIZ_MODE_LABEL[quiz.config.mode]} by default</Badge>
            <Badge tone="neutral">{quiz.question_count} questions</Badge>
            <Badge tone="neutral">{quiz.config.difficulty === "mixed" ? "Mixed difficulty" : quiz.config.difficulty === "adaptive" ? "Adaptive difficulty" : DIFFICULTY_LABEL[quiz.config.difficulty]}</Badge>
            {quiz.status === "generating" && <Badge tone="neutral">Generating…</Badge>}
          </div>
          <h1 className={PAGE_TITLE}>{quiz.title}</h1>
          <p className="text-sm text-muted-foreground">
            {quiz.material ? (
              <>
                From{" "}
                <Link href={`${routes.materials}/${quiz.material.id}`} className="font-medium text-foreground wrap-anywhere hover:underline">
                  {quiz.material.title}
                </Link>
                {quiz.material.subject ? ` · ${quiz.material.subject.name}` : ""}
              </>
            ) : (
              "Source material removed"
            )}
            {" · "}created {formatRelativeDate(quiz.created_at)}
            {quiz.provider ? ` · ${quiz.provider}` : ""}
          </p>
          {quiz.status_detail && quiz.status !== "failed" && <p className="text-sm text-muted-foreground">{quiz.status_detail}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quiz.status === "ready" && quiz.question_count > 0 && (
            <>
              <ExportMenu target={{ kind: "quiz", id: quiz.id }} label="Export questions" />
              <ExportMenu target={{ kind: "quiz", id: quiz.id, query: { answers: "1" } }} label="With answer key" />
            </>
          )}
          <QuizActions quizId={quiz.id} title={quiz.title} status={quiz.status} />
        </div>
      </div>

      {quiz.status === "failed" ? (
        <ErrorState title="This quiz could not be generated" description={quiz.status_detail ?? "Something went wrong while writing the questions."} />
      ) : quiz.status === "generating" ? (
        <GeneratingState title="Writing your quiz…" description="Questions appear here as soon as RevTaw finishes. This page checks by itself." />
      ) : quiz.question_count === 0 ? (
        <ErrorState title="This quiz has no questions" description="Make a new quiz from the material." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Ready when you are</CardTitle>
              <CardDescription>
                {inProgress ? "You have an attempt in progress. Continue it or start a fresh one." : "Start a practice run with feedback, or simulate the exam."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {inProgress && (
                  <Link href={`${routes.quiz}/${quiz.id}/attempt/${inProgress.id}`} className={buttonClasses({ size: "sm" })}>
                    Continue attempt
                  </Link>
                )}
                <StartAttemptButton quizId={quiz.id} config={quiz.config} questionCount={quiz.question_count} size="sm" variant={inProgress ? "secondary" : "primary"}>
                  {inProgress ? "Start new attempt" : "Start quiz"}
                </StartAttemptButton>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Question types</dt>
                  <dd className="mt-0.5 font-medium">{quiz.typeCounts.map((item) => `${item.count} ${QUESTION_TYPE_BY_ID[item.type].name}`).join(", ")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Timer</dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-medium">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    {quiz.config.timeLimitMinutes ? `${quiz.config.timeLimitMinutes} min` : "None by default"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Order</dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-medium">
                    <Shuffle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    {quiz.config.shuffleQuestions ? "Shuffled" : "Fixed"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Feedback</dt>
                  <dd className="mt-0.5 font-medium">{quiz.config.feedback === "immediate" ? "After each answer" : "After submission"}</dd>
                </div>
              </dl>
              {quiz.config.focus && (
                <p className="text-sm text-muted-foreground">
                  Focus: <span className="font-medium text-foreground">{quiz.config.focus}</span>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" aria-hidden="true" />
                Attempts
              </CardTitle>
              <CardDescription>{best !== null ? `Best score ${best}%.` : "No attempts yet."}</CardDescription>
            </CardHeader>
            <CardContent>
              {submitted.length === 0 ? (
                <EmptyState compact title="Nothing to show" description="Your scores and timings will appear here." />
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {submitted.slice(0, 10).map((attempt) => {
                    const percent = attempt.max_score ? Math.round(((attempt.score ?? 0) / attempt.max_score) * 100) : 0;
                    return (
                      <li key={attempt.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <Link href={`${routes.quiz}/${quiz.id}/attempt/${attempt.id}`} className="text-sm font-medium hover:underline">
                            {percent}% · {attempt.correct_count ?? 0}/{attempt.question_count} correct
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {QUIZ_MODE_LABEL[attempt.mode]} · {attempt.submitted_at ? formatRelativeDate(attempt.submitted_at) : ""}
                          </p>
                        </div>
                        <Badge tone={percent >= 80 ? "success" : percent >= 60 ? "warning" : "danger"}>{percent}%</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
