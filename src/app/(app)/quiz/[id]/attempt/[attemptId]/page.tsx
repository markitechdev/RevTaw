import { ArrowLeft, BookOpenCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ExportMenu } from "@/components/export/export-menu";
import { AttemptResults } from "@/components/quizzes/attempt-results";
import { QuizRunner } from "@/components/quizzes/quiz-runner";
import { buttonClasses } from "@/components/ui/button";
import { getAttemptResults, getAttemptRunner, getQuiz } from "@/lib/quizzes/queries";
import { expireIfNeeded } from "@/lib/quizzes/service";
import { routes } from "@/lib/routes";
import { getSessionForAttempt } from "@/lib/study/queries";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const quiz = await getQuiz(id);
  return { title: quiz ? `Attempt · ${quiz.title}` : "Quiz attempt" };
}

export default async function AttemptPage({ params }: PageProps<"/quiz/[id]/attempt/[attemptId]">) {
  const { id, attemptId } = await params;
  const quiz = await getQuiz(id);
  if (!quiz) notFound();

  const runner = await getAttemptRunner(attemptId);
  if (!runner || runner.attempt.quiz_id !== quiz.id) notFound();

  // A timed attempt left open past its deadline is submitted on arrival.
  const expired = await expireIfNeeded(runner.attempt);
  const showResults = expired || runner.attempt.status === "submitted";

  if (!showResults) {
    return (
      <div className="flex flex-col gap-4">
        <Link href={`${routes.quiz}/${quiz.id}`} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {quiz.title}
        </Link>
        <QuizRunner key={runner.attempt.id} view={runner} />
      </div>
    );
  }

  const [results, session] = await Promise.all([getAttemptResults(attemptId), getSessionForAttempt(attemptId)]);
  if (!results) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`${routes.quiz}/${quiz.id}`} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {quiz.title}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu target={{ kind: "results", id: attemptId }} label="Export results" />
            {session && (
              <Link href={`${routes.study}/${session.id}`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
                <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                Session summary
              </Link>
            )}
          </div>
        </div>
        {expired && <p className="text-sm text-warning">Time ran out, so this attempt was submitted automatically.</p>}
      </div>
      <AttemptResults view={results} questionCount={quiz.question_count} />
    </div>
  );
}
