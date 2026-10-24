import { BookOpenCheck, Brain, Layers, NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatRelativeDate } from "@/components/materials/material-card";
import { RoutinesCard } from "@/components/study/routines";
import { SessionBuilder } from "@/components/study/session-builder";
import { formatSeconds } from "@/components/study/session-summary";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TINT } from "@/components/ui/tint";
import { countDueCards } from "@/lib/flashcards/queries";
import { listMaterials } from "@/lib/materials/queries";
import { getPreferences } from "@/lib/preferences/queries";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { countOpenMistakes } from "@/lib/quizzes/queries";
import { routes } from "@/lib/routes";
import { methodName } from "@/lib/study/catalog";
import { getMnemonicCounts } from "@/lib/study/flows/memory";
import { getActivityStats, listSessions } from "@/lib/study/queries";
import { listRoutines } from "@/lib/study/routines";

export const metadata: Metadata = {
  title: "Study",
};

export default async function StudyPage({ searchParams }: PageProps<"/study">) {
  const params = await searchParams;
  const { user, profile } = await getCurrentUserWithProfile();
  if (!user) redirect(routes.login);
  const [materials, sessions, openMistakes, dueCards, activity, routines, mnemonics, preferences] = await Promise.all([listMaterials(), listSessions({ limit: 20 }), countOpenMistakes(), countDueCards(), getActivityStats(), listRoutines(), getMnemonicCounts(), getPreferences()]);
  const readyMaterials = materials.filter((material) => material.status === "ready").map((material) => ({ id: material.id, title: material.title, subject: material.subject?.name ?? null }));
  const inProgress = sessions.filter((session) => session.status === "in_progress");
  const finished = sessions.filter((session) => session.status !== "in_progress");

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
            {openMistakes > 0 && (
              <Link href={`${routes.study}?method=error_review`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <NotebookPen className="h-4 w-4" aria-hidden="true" />
                Retest {openMistakes} mistake{openMistakes === 1 ? "" : "s"}
              </Link>
            )}
          </>
        }
      />

      {inProgress.length > 0 && (
        <Card className={TINT.primary}>
          <CardHeader>
            <CardTitle>Continue where you left off</CardTitle>
            <CardDescription>Sessions in progress keep their place.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {inProgress.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`${routes.study}/${session.id}`} className="block truncate text-sm font-medium hover:underline">
                      {session.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {methodName(session.method)} · started {formatRelativeDate(session.started_at)}
                    </p>
                  </div>
                  <Link href={`${routes.study}/${session.id}`} className={buttonClasses({ size: "sm" })}>
                    Resume
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SessionBuilder
            preferredMethods={preferences.study.preferredMethods}
            materials={readyMaterials}
            defaultMinutes={profile?.preferred_session_minutes ?? 30}
            openMistakes={openMistakes}
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
                  {finished.slice(0, 8).map((session) => {
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
