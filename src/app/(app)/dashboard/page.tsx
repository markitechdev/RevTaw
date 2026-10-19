import {
  BookOpenCheck,
  CalendarDays,
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

import { Alert } from "@/components/forms/form-alert";
import { StatCard } from "@/components/dashboard/stat-card";
import { formatRelativeDate } from "@/components/materials/material-card";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { countDueCards, listDecks, nextDueAt } from "@/lib/flashcards/queries";
import { SOURCE_LABEL } from "@/lib/materials/constants";
import { countMaterials, listRecentMaterials } from "@/lib/materials/queries";
import { formatSessionMinutes, STUDY_GOAL_LABEL } from "@/lib/profile/options";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { countOpenMistakes, getConceptPerformance, listRecentAttempts } from "@/lib/quizzes/queries";
import { QUIZ_MODE_LABEL } from "@/lib/quizzes/types";
import { routes } from "@/lib/routes";

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

  const [materialCount, recentMaterials, concepts, recentAttempts, openMistakes, dueCards, decks, nextDue] = await Promise.all([
    countMaterials(),
    listRecentMaterials(5),
    getConceptPerformance(),
    listRecentAttempts(4),
    countOpenMistakes(),
    countDueCards(),
    listDecks(),
    nextDueAt(),
  ]);
  const dueDecks = decks.filter((deck) => deck.dueCount > 0).slice(0, 5);
  const lastOpened = recentMaterials.find((material) => material.last_opened_at) ?? recentMaterials[0];
  const weakConcepts = concepts.filter((concept) => concept.accuracy < 0.6).sort((a, b) => a.accuracy - b.accuracy || b.total - a.total).slice(0, 6);
  const strongConcepts = concepts.filter((concept) => concept.accuracy >= 0.8 && concept.total >= 2).sort((a, b) => b.accuracy - a.accuracy || b.total - a.total).slice(0, 6);

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
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {materialCount === 0 ? (
              <p>
                Upload one material and take a short quiz on it. After that, RevTaw can tell you which
                concepts need work and suggest a study method instead of guessing.
              </p>
            ) : weakConcepts.length > 0 ? (
              <p>
                You missed questions on{" "}
                <span className="font-medium text-foreground">{weakConcepts.slice(0, 3).map((concept) => concept.name).join(", ")}</span>.
                Re-read those sections, work through the{" "}
                <Link href={`${routes.quiz}/mistakes`} className="font-medium text-primary hover:underline">
                  {openMistakes} open {openMistakes === 1 ? "mistake" : "mistakes"}
                </Link>
                , then retake the quiz to confirm the fix.
              </p>
            ) : recentAttempts.length > 0 ? (
              <p>
                Your recent quizzes look solid. Generate a harder quiz or an exam simulation from the same material to
                check that the concepts hold under pressure, and keep the reviewer handy for a quick re-read.
              </p>
            ) : (
              <p>
                Open a material&apos;s overview and take a short quiz from it. That is when RevTaw starts
                tracking what you get wrong and can recommend what to study next instead of guessing.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Flame} label="Study streak" value="0 days" caption="Finish a session to start one." />
        <StatCard icon={Clock} label="Focus time today" value="0 min" caption="Sessions count toward this." />
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
        <Card>
          <CardHeader>
            <CardTitle>Due today</CardTitle>
            <CardDescription>Spaced repetition and scheduled reviews.</CardDescription>
          </CardHeader>
          <CardContent>
            {dueDecks.length === 0 ? (
              <EmptyState
                compact
                icon={CalendarDays}
                title="Nothing due"
                description={decks.length === 0 ? "Reviews appear here once you rate flashcards." : "Every card is scheduled for later. Come back when the next review is due."}
                action={
                  decks.length === 0 ? (
                    <Link href={routes.flashcards} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      Open Flashcards
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                <ul className="flex flex-col divide-y divide-border">
                  {dueDecks.map((deck) => (
                    <li key={deck.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <Link href={`${routes.flashcards}/${deck.id}/review?mode=due`} className="truncate text-sm font-medium hover:underline">
                        {deck.title}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{deck.dueCount} due</span>
                    </li>
                  ))}
                </ul>
                <Link href={`${routes.flashcards}/review`} className={buttonClasses({ size: "sm" })}>
                  <Layers className="h-4 w-4" aria-hidden="true" />
                  Review all due ({dueCards})
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming exams</CardTitle>
            <CardDescription>Countdown and preparation progress.</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card className="md:col-span-2 xl:col-span-1">
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
            <CardDescription>Concepts that need attention.</CardDescription>
          </CardHeader>
          <CardContent>
            {weakConcepts.length === 0 ? (
              <EmptyState
                compact
                icon={TrendingDown}
                title={concepts.length === 0 ? "Not enough data yet" : "No weak topics right now"}
                description={
                  concepts.length === 0
                    ? "RevTaw tracks mistakes at the concept level, so a couple of quizzes are enough to see patterns."
                    : "Every concept you have been quizzed on is above 60% accuracy."
                }
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {weakConcepts.map((concept) => (
                  <li key={concept.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="truncate">{concept.name}</span>
                    <span className="shrink-0 tabular-nums text-danger">
                      {concept.correct}/{concept.total}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Strong topics</CardTitle>
            <CardDescription>High-accuracy concepts.</CardDescription>
          </CardHeader>
          <CardContent>
            {strongConcepts.length === 0 ? (
              <EmptyState
                compact
                icon={TrendingUp}
                title="Nothing mastered yet"
                description="Topics move here once you answer their questions correctly more than once."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {strongConcepts.map((concept) => (
                  <li key={concept.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="truncate">{concept.name}</span>
                    <span className="shrink-0 tabular-nums text-success">
                      {concept.correct}/{concept.total}
                    </span>
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
