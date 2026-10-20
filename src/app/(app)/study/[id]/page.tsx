import { ArrowLeft, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlurtingRunner } from "@/components/study/blurting-runner";
import { CaseRunner } from "@/components/study/case-runner";
import { DualCodingRunner } from "@/components/study/dual-coding-runner";
import { ChunkRunner } from "@/components/study/chunk-runner";
import { FeynmanRunner } from "@/components/study/feynman-runner";
import { ConceptMapRunner, MindMapRunner } from "@/components/study/map-runners";
import { MnemonicRunner } from "@/components/study/mnemonic-runner";
import { PomodoroRunner } from "@/components/study/pomodoro-runner";
import { ProblemRunner } from "@/components/study/problem-runner";
import { QuestionGenRunner } from "@/components/study/question-gen-runner";
import { ReadingRunner } from "@/components/study/reading-runner";
import { RecallRunner } from "@/components/study/recall-runner";
import { ScenarioRunner } from "@/components/study/scenario-runner";
import { SessionSummaryCard } from "@/components/study/session-summary";
import { SmartSessionView } from "@/components/study/smart-session";
import { buttonClasses } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { getSmartSessionView } from "@/lib/adaptive/smart";
import { routes } from "@/lib/routes";
import { isRecallMethod, isTestMethod, isTutorMethod, methodName } from "@/lib/study/catalog";
import { getSessionMap, type MapView } from "@/lib/study/flows/maps";
import type { ConceptMapData, MindMapData } from "@/lib/study/maps";
import { getSession, getSessionMethod } from "@/lib/study/queries";
import { syncPlanChildren, syncPracticeTesting } from "@/lib/study/service";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession(id);
  return { title: session?.title ?? "Study session" };
}

/** Method-specific stats a finished session keeps in its summary (`extra`), so they survive a reload. */
function extraStatsFor(method: string, extra: Record<string, unknown> | undefined): Array<{ label: string; value: string }> {
  const number = (key: string) => (typeof extra?.[key] === "number" ? (extra[key] as number) : null);
  const stats: Array<{ label: string; value: string }> = [];
  const blocksTotal = number("blocksTotal");
  if ((method === "smart_study" || method === "custom_routine") && blocksTotal) stats.push({ label: "Blocks done", value: `${number("blocksDone") ?? 0}/${blocksTotal}` });
  const score = number("score");
  if (isTutorMethod(method) && score !== null) stats.push({ label: method === "teach_back" ? "Teaching score" : "Reasoning score", value: `${Math.round(score)}%` });
  const rounds = number("completedRounds");
  if (method === "pomodoro" && rounds !== null) stats.push({ label: "Rounds", value: String(rounds) });
  const quality = number("averageQuality");
  if (method === "question_generation" && quality !== null) stats.push({ label: "Average quality", value: `${Math.round(quality)}%` });
  return stats;
}

export default async function SessionPage({ params }: PageProps<"/study/[id]">) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) notFound();
  const name = methodName(session.method);
  // Blocks of a smart session link back to their plan.
  const parentId = (session.state as { parentId?: string } | null)?.parentId ?? null;
  const parentLabel = parentId ? ((await getSessionMethod(parentId)) === "custom_routine" ? "Back to routine" : "Back to smart session") : "Back to smart session";
  const parentLink = parentId ? (
    <Link href={`${routes.study}/${parentId}`} className={buttonClasses({ size: "sm" })}>
      {parentLabel}
    </Link>
  ) : null;

  if ((session.method === "smart_study" || session.method === "custom_routine") && session.status === "in_progress") {
    // Practice-test blocks close when their attempt is submitted; settle them before reading the plan.
    await syncPlanChildren(session.id);
    const view = await getSmartSessionView(session.id);
    if (!view) return <ErrorState title="This session has no plan" description="Start a new one from the Study page." />;
    return <SmartSessionView key={session.id} session={session} view={view} methodName={name} routine={session.method === "custom_routine"} />;
  }

  // Practice tests, mixed practice and exam simulations live in the quiz runner; the session closes once the attempt is submitted.
  if (isTestMethod(session.method)) {
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
    const extraStats = extraStatsFor(session.method, summary?.extra);
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
                {session.method === "mnemonics" && (
                  <Link href={routes.memoryAids} className={buttonClasses({ size: "sm", variant: "secondary" })}>
                    Open memory aids
                  </Link>
                )}
              </>
            }
          />
        ) : (
          <ErrorState title="No summary was saved for this session" />
        )}
      </div>
    );
  }

  if (isRecallMethod(session.method)) return <RecallRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} parentLabel={parentLabel} />;
  switch (session.method) {
    case "feynman":
      return <FeynmanRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} parentLabel={parentLabel} />;
    case "blurting":
      return <BlurtingRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} parentLabel={parentLabel} />;
    case "chunking":
      return <ChunkRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} parentLabel={parentLabel} />;
    case "question_generation":
      return <QuestionGenRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} parentLabel={parentLabel} />;
    case "worked_examples":
    case "faded_worked_examples":
    case "practice_problems":
      return <ProblemRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} parentLabel={parentLabel} />;
    case "scenario_based":
      return <ScenarioRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} parentLabel={parentLabel} />;
    case "case_based":
      return <CaseRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} parentLabel={parentLabel} />;
    case "sq3r":
    case "pq4r":
      return <ReadingRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} parentLabel={parentLabel} />;
    case "dual_coding":
      return <DualCodingRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} parentLabel={parentLabel} />;
    case "mind_mapping":
      return <MindMapRunner key={session.id} session={session} methodName={name} map={(await getSessionMap(session)) as MapView<MindMapData> | null} parentSessionId={parentId} parentLabel={parentLabel} />;
    case "concept_mapping":
      return <ConceptMapRunner key={session.id} session={session} methodName={name} map={(await getSessionMap(session)) as MapView<ConceptMapData> | null} parentSessionId={parentId} parentLabel={parentLabel} />;
    case "mnemonics":
      return <MnemonicRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} parentLabel={parentLabel} />;
    case "pomodoro":
      return <PomodoroRunner key={session.id} session={session} methodName={name} parentSessionId={parentId} parentLabel={parentLabel} />;
    default:
      return <ErrorState title="This method has no runner yet" description={`${name} sessions arrive in a later phase.`} />;
  }
}
