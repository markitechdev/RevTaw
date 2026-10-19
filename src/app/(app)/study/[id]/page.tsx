import { ArrowLeft, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FeynmanRunner } from "@/components/study/feynman-runner";
import { PomodoroRunner } from "@/components/study/pomodoro-runner";
import { RecallRunner } from "@/components/study/recall-runner";
import { SessionSummaryCard } from "@/components/study/session-summary";
import { buttonClasses } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { routes } from "@/lib/routes";
import { methodName } from "@/lib/study/catalog";
import { getSession } from "@/lib/study/queries";
import { syncPracticeTesting } from "@/lib/study/service";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession(id);
  return { title: session?.title ?? "Study session" };
}

export default async function SessionPage({ params }: PageProps<"/study/[id]">) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) notFound();
  const name = methodName(session.method);

  // Practice testing lives in the quiz runner; the session closes once the attempt is submitted.
  if (session.method === "practice_testing") {
    const state = session.state as { quizId?: string; attemptId?: string } | null;
    const summary = session.parsedSummary ?? (await syncPracticeTesting(session));
    if (!summary && state?.quizId && state.attemptId) redirect(`${routes.quiz}/${state.quizId}/attempt/${state.attemptId}?session=${session.id}`);
    if (summary) {
      const attemptId = (summary.extra as { attemptId?: string } | undefined)?.attemptId ?? state?.attemptId;
      return (
        <div className="flex flex-col gap-4">
          <Link href={routes.study} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Study
          </Link>
          <SessionSummaryCard
            title={`${name} complete`}
            summary={summary}
            actions={
              <>
                {state?.quizId && attemptId && (
                  <Link href={`${routes.quiz}/${state.quizId}/attempt/${attemptId}`} className={buttonClasses({ size: "sm" })}>
                    <ListChecks className="h-4 w-4" aria-hidden="true" />
                    Review every question
                  </Link>
                )}
                <Link href={routes.study} className={buttonClasses({ size: "sm", variant: "secondary" })}>
                  Back to Study
                </Link>
              </>
            }
          />
        </div>
      );
    }
    return <ErrorState title="This session has no test attached" description="Start a new practice test from the Study page." />;
  }

  if (session.status !== "in_progress") {
    const summary = session.parsedSummary;
    return (
      <div className="flex flex-col gap-4">
        <Link href={routes.study} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Study
        </Link>
        {summary ? (
          <SessionSummaryCard
            title={session.status === "abandoned" ? `${name} stopped early` : `${name} complete`}
            summary={summary}
            actions={
              <Link href={routes.study} className={buttonClasses({ size: "sm" })}>
                Back to Study
              </Link>
            }
          />
        ) : (
          <ErrorState title="No summary was saved for this session" />
        )}
      </div>
    );
  }

  switch (session.method) {
    case "active_recall":
    case "error_review":
      return <RecallRunner key={session.id} session={session} methodName={name} />;
    case "feynman":
      return <FeynmanRunner key={session.id} session={session} methodName={name} />;
    case "pomodoro":
      return <PomodoroRunner key={session.id} session={session} methodName={name} />;
    default:
      return <ErrorState title="This method has no runner yet" description={`${name} sessions arrive in a later phase.`} />;
  }
}
