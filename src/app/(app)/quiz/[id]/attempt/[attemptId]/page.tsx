import { BookOpenCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AssistantLauncher, AssistantPage } from "@/components/assistant/assistant-provider";
import { ExportMenu } from "@/components/export/export-menu";
import { AttemptResults } from "@/components/quizzes/attempt-results";
import { QuizRunner } from "@/components/quizzes/quiz-runner";
import { buttonClasses } from "@/components/ui/button";
import { BackLink, DetailHeader } from "@/components/ui/page-header";
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
        {/* No floating button while answering: the quiz keeps the student's focus (and its answers stay theirs). */}
        <AssistantLauncher mode="hidden" />
        <BackLink href={`${routes.quiz}/${quiz.id}`} label={quiz.title} />
        <QuizRunner key={runner.attempt.id} view={runner} />
      </div>
    );
  }

  const [results, session] = await Promise.all([getAttemptResults(attemptId), getSessionForAttempt(attemptId)]);
  if (!results) notFound();
  const firstWrong = results.questions.findIndex((question) => question.isCorrect === false);

  return (
    <div className="flex flex-col gap-4">
      <AssistantPage
        context={{ kind: "attempt", id: attemptId }}
        label={`${quiz.title} → Results`}
        materialId={quiz.material_id}
        suggestions={firstWrong >= 0 ? [`Why did I get number ${firstWrong + 1} wrong?`, "Explain my mistakes simply", "Quiz me again on what I missed"] : ["What should I study next?", "Explain the trickiest question", "Quiz me on something harder"]}
      />
      <DetailHeader
        back={{ href: `${routes.quiz}/${quiz.id}`, label: quiz.title }}
        title="Results"
        status={expired && <p className="text-sm text-warning">Time ran out, so this attempt was submitted automatically.</p>}
        actions={
          <>
            <ExportMenu target={{ kind: "results", id: attemptId }} label="Export results" />
            {session && (
              <Link href={`${routes.study}/${session.id}`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
                <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                Session summary
              </Link>
            )}
          </>
        }
      />
      <AttemptResults view={results} questionCount={quiz.question_count} />
    </div>
  );
}
