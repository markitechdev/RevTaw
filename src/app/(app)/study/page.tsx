import { BookOpenCheck, Brain, Layers, NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatRelativeDate } from "@/components/materials/material-card";
import { RoutinesCard } from "@/components/study/routines";
import { SessionBuilder } from "@/components/study/session-builder";
import { formatSeconds } from "@/components/study/session-summary";
import { UnfinishedSessions } from "@/components/study/unfinished-sessions";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { countDueCards } from "@/lib/flashcards/queries";
import { listMaterials } from "@/lib/materials/queries";
import { getPreferences } from "@/lib/preferences/queries";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { countMistakesDue } from "@/lib/quizzes/queries";
import { routes } from "@/lib/routes";
import { isPlanMethod, methodName, unfinishedKind } from "@/lib/study/catalog";
import { getMnemonicCounts } from "@/lib/study/flows/memory";
import { getActivityStats, listSessions } from "@/lib/study/queries";
import { listRoutines } from "@/lib/study/routines";
import type { UnfinishedSessionView } from "@/lib/study/unfinished";

export const metadata: Metadata = {
  title: "Study",
};

export default async function StudyPage({ searchParams }: PageProps<"/study">) {
  const params = await searchParams;
  const { user, profile } = await getCurrentUserWithProfile();
  if (!user) redirect(routes.login);
  const [materials, unfinished, finished, mistakes, dueCards, activity, routines, mnemonics, preferences] = await Promise.all([
    listMaterials(),
    listSessions({ status: "in_progress", limit: 60 }),
    listSessions({ status: "finished", limit: 8 }),
    countMistakesDue(),
    countDueCards(),
    getActivityStats(),
    listRoutines(),
    getMnemonicCounts(),
    getPreferences(),
  ]);
  const readyMaterials = materials.filter((material) => material.status === "ready").map((material) => ({ id: material.id, title: material.title, subject: material.subject?.name ?? null }));
  // Uploads not processed yet, so the session builder can say why most methods are locked.
  const waitingMaterials = {
    preparing: materials.filter((material) => material.status === "uploading" || material.status === "extracting" || material.status === "analyzing").length,
    failed: materials.filter((material) => material.status === "failed").length,
  };
  // A plan's unfinished blocks continue from the plan, which has its own row.
  const openPlans = new Set(unfinished.filter((session) => isPlanMethod(session.method)).map((session) => session.id));
  const inProgress: UnfinishedSessionView[] = unfinished
    .filter((session) => !session.parent_id || !openPlans.has(session.parent_id))
    .map((session) => {
      const kind = unfinishedKind(session.method);
      const answered = session.items_correct + session.items_incorrect;
      const progress = kind === "timer" ? (session.focus_seconds >= 60 ? `${Math.round(session.focus_seconds / 60)} min focused` : null) : answered > 0 ? `${answered} ${kind === "review" ? "rated" : "answered"}` : null;
      return {
        id: session.id,
        title: session.title,
        kind,
        href: `${routes.study}/${session.id}`,
        answered,
        meta: [methodName(session.method), `started ${formatRelativeDate(session.started_at)}`, progress].filter(Boolean).join(" · "),
      };
    });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Study"
        description="Build a session from a material, your time and your goal. Each method changes how the session runs — what is hidden, what is asked and what is tracked."
        actions={
          <>
            {dueCards > 0 && (
              <Link href={`${routes.flashcards}/review`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <Layers className="h-4 w-4" aria-hidden="true" />
                Review {dueCards} due card{dueCards === 1 ? "" : "s"}
              </Link>
            )}
            {/* Mistakes due for a retest (missed before today); an Error Review from the builder takes today's too. */}
            {mistakes.due > 0 && (
              <Link href={`${routes.study}?method=error_review`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <NotebookPen className="h-4 w-4" aria-hidden="true" />
                Retest {mistakes.due} mistake{mistakes.due === 1 ? "" : "s"}
              </Link>
            )}
          </>
        }
      />

      <UnfinishedSessions sessions={inProgress} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SessionBuilder
            preferredMethods={preferences.study.preferredMethods}
            materials={readyMaterials}
            waitingMaterials={waitingMaterials}
            defaultMinutes={profile?.preferred_session_minutes ?? 30}
            openMistakes={mistakes.due + mistakes.today}
            dueCards={dueCards}
            initialMethod={typeof params.method === "string" ? params.method : undefined}
            initialMaterialId={typeof params.material === "string" ? params.material : undefined}
            savedMnemonics={mnemonics.practicable}
          />
        </div>
        <div className="flex flex-col gap-4">
          <RoutinesCard routines={routines.map((routine) => ({ id: routine.id, title: routine.title, description: routine.description, blocks: routine.blocks, totalMinutes: routine.totalMinutes, last_used_at: routine.last_used_at }))} materials={readyMaterials.map((material) => ({ id: material.id, title: material.title }))} />
          <Card>
            <CardHeader>
              <CardTitle>Memory aids</CardTitle>
              <CardDescription>Mnemonics you saved or wrote yourself, and your memory palaces.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                {mnemonics.total} saved mnemonic{mnemonics.total === 1 ? "" : "s"}
              </span>
              <Link href={routes.memoryAids} className={buttonClasses({ size: "sm", variant: "secondary", className: "shrink-0 whitespace-nowrap" })}>
                <Brain className="h-4 w-4" aria-hidden="true" />
                Open memory aids
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>This week</CardTitle>
              <CardDescription>Focus time and streak from your sessions.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Streak</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {activity.streakDays} day{activity.streakDays === 1 ? "" : "s"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Today</dt>
                  <dd className="text-lg font-semibold tabular-nums">{Math.round(activity.focusSecondsToday / 60)} min</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">7 days</dt>
                  <dd className="text-lg font-semibold tabular-nums">{Math.round(activity.focusSecondsWeek / 60)} min</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent sessions</CardTitle>
              <CardDescription>{activity.sessionsCompleted} completed in the last 90 days.</CardDescription>
            </CardHeader>
            <CardContent>
              {finished.length === 0 ? (
                <EmptyState compact icon={BookOpenCheck} title="No sessions yet" description="Your first summary appears here after a session." />
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {finished.map((session) => {
                    const accuracy = session.summary?.accuracy;
                    return (
                      <li key={session.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <Link href={`${routes.study}/${session.id}`} className="block truncate text-sm font-medium hover:underline">
                            {session.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {methodName(session.method)} · {formatSeconds(session.focus_seconds)}
                            {session.completed_at ? ` · ${formatRelativeDate(session.completed_at)}` : ""}
                          </p>
                        </div>
                        {accuracy !== null && accuracy !== undefined ? (
                          <Badge tone={accuracy >= 0.8 ? "success" : accuracy >= 0.6 ? "warning" : "danger"}>{Math.round(accuracy * 100)}%</Badge>
                        ) : session.status === "abandoned" ? (
                          <Badge tone="neutral">Stopped</Badge>
                        ) : (
                          <Badge tone="neutral">Done</Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
