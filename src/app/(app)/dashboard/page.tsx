import {
  BookOpenCheck,
  Clock,
  Flame,
  FolderOpen,
  Layers,
  ListChecks,
  NotebookPen,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MasteryBar } from "@/components/adaptive/mastery-table";
import { DueTodayCard } from "@/components/planner/due-today";
import { ExamCard } from "@/components/planner/exam-card";
import { RecommendationList } from "@/components/adaptive/recommendation-list";
import { Alert } from "@/components/forms/form-alert";
import { StatCard } from "@/components/dashboard/stat-card";
import { LevelCard } from "@/components/gamification/badges";
import { formatRelativeDate } from "@/components/materials/material-card";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getMasterySummary } from "@/lib/adaptive/engine";
import { MASTERY_THRESHOLD } from "@/lib/adaptive/mastery";
import { getRecommendations } from "@/lib/adaptive/recommend";
import { countDueCards, listDecks, nextDueAt } from "@/lib/flashcards/queries";
import { ACHIEVEMENTS } from "@/lib/gamification/achievements";
import { getGamificationView, syncGamification } from "@/lib/gamification/sync";
import { SOURCE_LABEL } from "@/lib/materials/constants";
import { countMaterials, listRecentMaterials } from "@/lib/materials/queries";
import { formatSessionMinutes, STUDY_GOAL_LABEL } from "@/lib/profile/options";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { syncNotifications } from "@/lib/notifications/service";
import { getDueToday, getNextExam } from "@/lib/planner/queries";
import { plannerClock, rebalanceAllPlans } from "@/lib/planner/service";
import { countOpenMistakes, listRecentAttempts } from "@/lib/quizzes/queries";
import { QUIZ_MODE_LABEL } from "@/lib/quizzes/types";
import { routes } from "@/lib/routes";
import { getActivityStats } from "@/lib/study/queries";

export const metadata: Metadata = {
  title: "Dashboard",
};

const NOTICES: Record<string, string> = {
  "password-updated": "Your password has been updated. Other devices have been signed out.",
  welcome: "You're all set. Upload your first material to start building reviewers.",
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const { user, profile } = await getCurrentUserWithProfile();
  if (!user) redirect(routes.login);

  // Plans adjust first (today's tasks are read below); the XP/badge and notification
  // syncs only write what the level card and the bell read, so they run alongside the
  // page's own reads, and the gamification view is read once they are done (§31).
  await rebalanceAllPlans();
  const [, , materialCount, recentMaterials, mastery, recommendations, recentAttempts, openMistakes, dueCards, decks, nextDue, activity, due, nextExam, clock] = await Promise.all([
    syncGamification(),
    syncNotifications(),
    countMaterials(),
    listRecentMaterials(5),
    getMasterySummary(),
    getRecommendations(2),
    listRecentAttempts(4),
    countOpenMistakes(),
    countDueCards(),
    listDecks(),
    nextDueAt(),
    getActivityStats(),
    getDueToday(),
    getNextExam(),
    plannerClock(),
  ]);
  const gamification = await getGamificationView();
  const lastOpened = recentMaterials.find((material) => material.last_opened_at) ?? recentMaterials[0];
  // Weak = status weak or learning (needs attention); strong = strong or mastered (§23, §28).
  const weakConcepts = [...mastery.weak, ...mastery.learning].sort((a, b) => Number(a.mastery) - Number(b.mastery)).slice(0, 6);
  const strongConcepts = [...mastery.mastered, ...mastery.strong].sort((a, b) => Number(b.mastery) - Number(a.mastery)).slice(0, 6);

  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const firstName = profile?.display_name?.split(" ")[0];
  const goal = profile?.main_goal ? STUDY_GOAL_LABEL[profile.main_goal] : null;
  const sessionLength = formatSessionMinutes(profile?.preferred_session_minutes ?? null);

  const uploadLink = (
    <Link href={routes.materials} className={buttonClasses({ size: "sm" })}>
      <Upload className="h-4 w-4" aria-hidden="true" />
      Upload material
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert tone="success">{notice}</Alert>}

      <PageHeader
        eyebrow={goal ? `Goal: ${goal}` : undefined}
        title={firstName ? `${greeting()}, ${firstName}.` : `${greeting()}.`}
        description={`Your preferred session is ${sessionLength}. Everything RevTaw recommends will be sized to fit it.`}
        actions={uploadLink}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Continue studying</CardTitle>
            <CardDescription>Pick up where you left off.</CardDescription>
          </CardHeader>
          <CardContent>
            {lastOpened ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last opened material</p>
                  <p className="truncate font-medium">{lastOpened.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {lastOpened.subject?.name ?? "No subject"} · {SOURCE_LABEL[lastOpened.source]}
                    {lastOpened.last_opened_at ? ` · opened ${formatRelativeDate(lastOpened.last_opened_at)}` : ""}
                  </p>
                </div>
                <Link href={`${routes.materials}/${lastOpened.id}`} className={buttonClasses({ size: "sm" })}>
                  <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                  Open overview
                </Link>
              </div>
            ) : (
              <EmptyState
                compact
                icon={BookOpenCheck}
                title="No sessions yet"
                description="Your first study session starts from a material. Upload notes, a PDF or a screenshot and RevTaw will turn it into a reviewer."
                action={uploadLink}
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary-soft/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              RevTaw recommendation
            </CardTitle>
            <CardDescription>{materialCount === 0 ? "Appears once there is something to study." : "Chosen from your mastery, confidence and due reviews — with the reason."}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {materialCount === 0 ? (
              <p className="text-muted-foreground">
                Upload one material and take a short quiz on it. After that, RevTaw can tell you which
                concepts need work and suggest a study method instead of guessing.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <RecommendationList items={recommendations} />
                <Link href={`${routes.study}?method=smart_study`} className={buttonClasses({ size: "sm", variant: "secondary", className: "self-start" })}>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Plan a Smart Study session
                </Link>
                <p className="text-xs text-muted-foreground">
                  Smart Study builds a full session from your mistakes, weak concepts and due cards, sized to {sessionLength}.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          icon={Flame}
          label="Study streak"
          value={`${activity.streakDays} day${activity.streakDays === 1 ? "" : "s"}`}
          caption={activity.streakDays === 0 ? "Finish a session to start one." : "Sessions, quizzes and reviews keep it going."}
        />
        <StatCard
          icon={Clock}
          label="Focus time today"
          value={`${Math.round(activity.focusSecondsToday / 60)} min`}
          caption={`${Math.round(activity.focusSecondsWeek / 60)} min in the last 7 days.`}
        />
        <StatCard
          icon={Layers}
          label="Flashcards due"
          value={String(dueCards)}
          caption={dueCards > 0 ? "Review them before they fade." : decks.length === 0 ? "Generate a deck from a material." : nextDue ? "Nothing due right now." : "All caught up."}
        />
        <StatCard
          icon={FolderOpen}
          label="Materials"
          value={String(materialCount)}
          caption={materialCount === 0 ? "PDF, DOCX, images or notes." : "Open Materials to review them."}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DueTodayCard due={due} compact />

        <Card>
          <CardHeader>
            <CardTitle>Upcoming exams</CardTitle>
            <CardDescription>Countdown and preparation progress.</CardDescription>
          </CardHeader>
          <CardContent>
            {nextExam ? (
              <ExamCard exam={nextExam} today={clock.today} compact />
            ) : (
              <EmptyState
                compact
                icon={Target}
                title="No exams scheduled"
                description="Add an exam date in the Planner and RevTaw will pace your reviews toward it."
                action={
                  <Link href={routes.planner} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    Open Planner
                  </Link>
                }
              />
            )}
          </CardContent>
        </Card>

        <LevelCard xp={gamification.xp} level={gamification.level} streakDays={gamification.streakDays} unlockedCount={gamification.unlockedCount} total={ACHIEVEMENTS.length} />

        <Card className="md:col-span-2 xl:col-span-3">
          <CardHeader>
            <CardTitle>Recent materials</CardTitle>
            <CardDescription>Recently opened files.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentMaterials.length === 0 ? (
              <EmptyState
                compact
                icon={FolderOpen}
                title="No materials yet"
                description="Everything you upload stays private to your account."
                action={uploadLink}
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {recentMaterials.map((material) => (
                  <li key={material.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`${routes.materials}/${material.id}`} className="block truncate text-sm font-medium hover:underline">
                        {material.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {material.subject?.name ?? "No subject"} · {formatRelativeDate(material.last_opened_at ?? material.updated_at)}
                      </p>
                    </div>
                    {material.status !== "ready" && (
                      <span className="shrink-0 text-xs text-muted-foreground">{material.status === "failed" ? "Failed" : "Processing…"}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Weak topics</CardTitle>
            <CardDescription>
              <Link href={routes.progress} className="hover:underline">
                Concepts below 60% mastery.
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {weakConcepts.length === 0 ? (
              <EmptyState
                compact
                icon={TrendingDown}
                title={mastery.total === 0 ? "Not enough data yet" : "No weak topics right now"}
                description={
                  mastery.total === 0
                    ? "RevTaw tracks mastery at the concept level, so one quiz or recall session is enough to see patterns."
                    : "Every concept you have practised is strong or mastered."
                }
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {weakConcepts.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="truncate">{row.concept?.name ?? "Concept"}</span>
                    <MasteryBar value={Number(row.mastery)} status={row.status} compact />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Strong topics</CardTitle>
            <CardDescription>
              <Link href={routes.progress} className="hover:underline">
                Strong from 60%, mastered at {MASTERY_THRESHOLD}%.
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {strongConcepts.length === 0 ? (
              <EmptyState
                compact
                icon={TrendingUp}
                title="Nothing mastered yet"
                description="Topics move here once their mastery passes 60%, and count as mastered at 80%."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {strongConcepts.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="truncate">{row.concept?.name ?? "Concept"}</span>
                    <MasteryBar value={Number(row.mastery)} status={row.status} compact />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent quizzes</CardTitle>
            <CardDescription>
              {openMistakes > 0 ? (
                <Link href={`${routes.quiz}/mistakes`} className="hover:underline">
                  <NotebookPen className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  {openMistakes} {openMistakes === 1 ? "mistake" : "mistakes"} to review
                </Link>
              ) : (
                "Latest scores."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentAttempts.length === 0 ? (
              <EmptyState
                compact
                icon={ListChecks}
                title="No quizzes taken yet"
                description="Generate one from a material to start tracking concepts."
                action={
                  <Link href={routes.quiz} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    Open Quiz
                  </Link>
                }
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {recentAttempts.map((attempt) => {
                  const percent = attempt.max_score ? Math.round(((attempt.score ?? 0) / attempt.max_score) * 100) : 0;
                  return (
                    <li key={attempt.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <Link href={`${routes.quiz}/${attempt.quiz_id}/attempt/${attempt.id}`} className="block truncate text-sm font-medium hover:underline">
                          {attempt.quiz?.title ?? "Quiz"}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {QUIZ_MODE_LABEL[attempt.mode]} · {attempt.correct_count ?? 0}/{attempt.question_count} correct
                          {attempt.submitted_at ? ` · ${formatRelativeDate(attempt.submitted_at)}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${percent >= 80 ? "text-success" : percent >= 60 ? "text-warning" : "text-danger"}`}>{percent}%</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
