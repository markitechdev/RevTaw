import { ArrowLeft, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlurtingRunner } from "@/components/study/blurting-runner";
import { ChunkRunner } from "@/components/study/chunk-runner";
import { FeynmanRunner } from "@/components/study/feynman-runner";
import { PomodoroRunner } from "@/components/study/pomodoro-runner";
import { QuestionGenRunner } from "@/components/study/question-gen-runner";
import { RecallRunner } from "@/components/study/recall-runner";
import { SessionSummaryCard } from "@/components/study/session-summary";
import { SmartSessionView } from "@/components/study/smart-session";
import { buttonClasses } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { getSmartSessionView } from "@/lib/adaptive/smart";
import { routes } from "@/lib/routes";
import { isRecallMethod, isTutorMethod, methodName } from "@/lib/study/catalog";
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
  // Blocks of a smart session link back to their plan.
  const parentId = (session.state as { parentId?: string } | null)?.parentId ?? null;
  const parentLink = parentId ? (
    <Link href={`${routes.study}/${parentId}`} className={buttonClasses({ size: "sm" })}>
      Back to smart session
    </Link>
  ) : null;

  if (session.method === "smart_study" && session.status === "in_progress") {
    const view = await getSmartSessionView(session.id);
    if (!view) return <ErrorState title="This smart session has no plan" description="Start a new one from the Study page." />;
    return <SmartSessionView key={session.id} session={session} view={view} />;
  }

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
                {parentLink}
                {state?.quizId && attemptId && (
                  <Link href={`${routes.quiz}/${state.quizId}/attempt/${attemptId}`} className={buttonClasses({ size: "sm", variant: parentLink ? "secondary" : "primary" })}>
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

  if (session.status === "in_progress" && isTutorMethod(session.method)) {
    const conversationId = (session.state as { conversationId?: string } | null)?.conversationId;
    if (conversationId) redirect(`${routes.tutor}/${conversationId}`);
  }

  if (session.status !== "in_progress") {
    const summary = session.parsedSummary;
    const blocks = (summary?.extra as { blocksDone?: number; blocksTotal?: number } | undefined) ?? {};
    const tutorScore = isTutorMethod(session.method) ? (summary?.extra as { score?: number } | undefined)?.score : undefined;
    const extraStats = [
      ...(session.method === "smart_study" && blocks.blocksTotal ? [{ label: "Blocks done", value: `${blocks.blocksDone ?? 0}/${blocks.blocksTotal}` }] : []),
      ...(typeof tutorScore === "number" ? [{ label: session.method === "teach_back" ? "Teaching score" : "Reasoning score", value: `${Math.round(tutorScore)}%` }] : []),
    ];
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
            extraStats={extraStats}
            actions={
              <>
                {parentLink}
                <Link href={routes.study} className={buttonClasses({ size: "sm", variant: parentLink ? "secondary" : "primary" })}>
                  Back to Study
                </Link>
              </>
            }
          />
        ) : (
          <ErrorState title="No summary was saved for this session" />
        )}
      </div>
    );
  }

  if (isRecallMethod(session.method)) return <RecallRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} />;
  switch (session.method) {
    case "feynman":
      return <FeynmanRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} />;
    case "blurting":
      return <BlurtingRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} />;
    case "chunking":
      return <ChunkRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} />;
    case "question_generation":
      return <QuestionGenRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} />;
    case "pomodoro":
      return <PomodoroRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} />;
    default:
      return <ErrorState title="This method has no runner yet" description={`${name} sessions arrive in a later phase.`} />;
  }
}
