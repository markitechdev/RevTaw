import { Brain, CheckCircle2, Clock, Flag, Gauge, Layers, ListChecks, Map, ShieldAlert, Sparkles, Target, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MasteryTable } from "@/components/adaptive/mastery-table";
import { AssistantPage } from "@/components/assistant/assistant-provider";
import { RecommendationList } from "@/components/adaptive/recommendation-list";
import { DailyColumns, PercentBars, ScoreColumns, StatusStrip } from "@/components/analytics/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { ExportMenu } from "@/components/export/export-menu";
import { LevelCard } from "@/components/gamification/badges";
import { GoalList, NewGoalButton } from "@/components/planner/goals";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SECTION_TITLE } from "@/components/ui/typography";
import { getMasterySummary, listMastery } from "@/lib/adaptive/engine";
import { MASTERY_THRESHOLD, STATUS_BANDS, STATUS_LABEL } from "@/lib/adaptive/mastery";
import { getRecommendations } from "@/lib/adaptive/recommend";
import { ANALYTICS_DAYS, getAnalyticsOverview } from "@/lib/analytics/queries";
import { ACHIEVEMENTS } from "@/lib/gamification/achievements";
import { getGamificationView, syncGamification } from "@/lib/gamification/sync";
import { listMaterials } from "@/lib/materials/queries";
import { listGoalsWithProgress } from "@/lib/planner/goals";
import { plannerClock } from "@/lib/planner/service";
import { routes } from "@/lib/routes";
import { getActivityStats } from "@/lib/study/queries";

export const metadata: Metadata = {
  title: "Progress",
};

export default async function ProgressPage() {
  // Active days and badges settle alongside the page's reads; only the level card waits for them (§31).
  const [, rows, summary, recommendations, activity, analytics, goals, materials, clock] = await Promise.all([syncGamification(), listMastery(), getMasterySummary(), getRecommendations(3), getActivityStats(), getAnalyticsOverview(), listGoalsWithProgress(), listMaterials(), plannerClock()]);
  const gamification = await getGamificationView();
  const readyMaterials = materials.filter((material) => material.status === "ready").map((material) => ({ id: material.id, title: material.title }));
  const practiced = rows.filter((row) => row.attempts > 0);
  const hasActivity = analytics.totals.questions > 0 || analytics.totals.sessions > 0 || analytics.totals.cards > 0;

  return (
    <div className="flex flex-col gap-6">
      <AssistantPage context={{ kind: "progress" }} label="Your progress" />
      <PageHeader
        title="Progress"
        description={`What your studying adds up to: scores, accuracy, time, mastery per concept and where you stand. A concept counts as mastered at ${MASTERY_THRESHOLD}%, once you have shown it on a hard question and again on another day; nothing is ever locked — RevTaw just recommends more practice.`}
        actions={
          <>
            <ExportMenu target={{ kind: "progress" }} label="Export report" />
            <Link href={`${routes.progress}/map`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
              <Map className="h-4 w-4" aria-hidden="true" />
              Mastery map
            </Link>
            <Link href={`${routes.study}?method=smart_study`} className={buttonClasses({ size: "sm" })}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Tamari&apos;s Study Plan
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Target} label="Average quiz score" value={analytics.totals.averageScore === null ? "—" : `${analytics.totals.averageScore}%`} caption={analytics.totals.averageScore === null ? "No quiz submitted yet." : `Over ${analytics.scores.length} recent quiz${analytics.scores.length === 1 ? "" : "zes"}.`} />
        <StatCard icon={CheckCircle2} label="Accuracy" value={analytics.totals.accuracy === null ? "—" : `${analytics.totals.accuracy}%`} caption={analytics.totals.questions ? `${analytics.totals.questions.toLocaleString("en-US")} questions answered in total.` : "Answer questions to see it."} />
        <StatCard icon={Clock} label={`Study time, ${ANALYTICS_DAYS} days`} value={`${analytics.totals.focusMinutes} min`} caption={`${analytics.totals.sessions} session${analytics.totals.sessions === 1 ? "" : "s"} completed · ${activity.streakDays}-day streak`} />
        <StatCard icon={Layers} label={`Flashcards, ${ANALYTICS_DAYS} days`} value={String(analytics.totals.cards)} caption={analytics.totals.cards ? "Reviews keep the schedule honest." : "No reviews in this period."} />
        <StatCard icon={Brain} label="Concepts tracked" value={String(summary.total)} caption={summary.total === 0 ? "Answer questions to start tracking." : `${summary.mastered.length} mastered · ${summary.needsWork.length} need work`} />
        <StatCard icon={Gauge} label="Average mastery" value={summary.averageMastery === null ? "—" : `${summary.averageMastery}%`} caption={summary.averageMastery === null ? "No answers yet." : summary.averageMastery >= MASTERY_THRESHOLD ? "Above the mastery line." : "Weak concepts pull this down."} />
        <StatCard icon={TrendingUp} label="Retrieval strength" value={analytics.retrieval.average === null ? "—" : `${analytics.retrieval.average}%`} caption={analytics.retrieval.average === null ? "Fades until the next review." : analytics.retrieval.fading ? `${analytics.retrieval.fading} concept${analytics.retrieval.fading === 1 ? "" : "s"} due for review.` : "Nothing due for review right now."} />
        <StatCard icon={ShieldAlert} label="Possible misconceptions" value={String(summary.misconceptions.length)} caption={summary.misconceptions.length ? "Confident but wrong — see below." : "No confident wrong answers."} />
      </div>

      {hasActivity ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-5">
              <DailyColumns title={`Study time, last ${ANALYTICS_DAYS} days`} points={analytics.days.map((day) => ({ date: day.date, value: day.focusMinutes }))} unit="min" seriesLabel="Minutes" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <DailyColumns title={`Questions answered, last ${ANALYTICS_DAYS} days`} points={analytics.days.map((day) => ({ date: day.date, value: day.answered, secondary: day.correct }))} unit="answered" seriesLabel="Answered" secondaryLabel="Correct" />
            </CardContent>
          </Card>
          {analytics.scores.length > 0 && (
            <Card>
              <CardContent className="pt-5">
                <ScoreColumns title="Quiz scores, latest first to last" scores={analytics.scores} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-5">
              <DailyColumns title={`Flashcards reviewed, last ${ANALYTICS_DAYS} days`} points={analytics.days.map((day) => ({ date: day.date, value: day.cards }))} unit="cards" seriesLabel="Cards" />
            </CardContent>
          </Card>
        </div>
      ) : (
        <EmptyState icon={ListChecks} title="No activity to chart yet" description="Finish a session, take a quiz or review flashcards and the charts fill in day by day." action={<Link href={routes.study} className={buttonClasses({ size: "sm" })}>Start a session</Link>} />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Performance by subject</CardTitle>
            <CardDescription>Average mastery of the concepts practiced per subject.</CardDescription>
          </CardHeader>
          <CardContent>
            <PercentBars title="Mastery by subject" rows={analytics.bySubject.map((group) => ({ key: group.id ?? "none", label: group.name, percent: group.averageMastery, detail: `${group.concepts} concept${group.concepts === 1 ? "" : "s"}` }))} emptyText="Practice a concept to see its subject here." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Performance by topic</CardTitle>
            <CardDescription>Average mastery per material; the weakest first.</CardDescription>
          </CardHeader>
          <CardContent>
            <PercentBars title="Mastery by material" rows={analytics.byMaterial.slice(0, 8).map((group) => ({ key: group.id ?? "none", label: group.name, percent: group.averageMastery, detail: `${group.weak} weak`, href: group.href }))} emptyText="Practice a material to see it here." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Difficulty and confidence</CardTitle>
            <CardDescription>Accuracy by question difficulty, and by how sure you felt.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PercentBars title="Accuracy by difficulty" rows={analytics.byDifficulty.map((row) => ({ key: row.key, label: row.label, percent: row.accuracy, detail: `${row.answered} answered` }))} emptyText="Answer quiz questions to compare difficulties." />
            <PercentBars title="Accuracy by confidence" rows={analytics.byConfidence.map((row) => ({ key: row.key, label: row.label, percent: row.accuracy, detail: `${row.answered} answered` }))} emptyText="Rate your confidence on answers to see the calibration." />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Mastery overview</CardTitle>
            <CardDescription>How your practiced concepts are spread across the statuses.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusStrip title="Concepts by status" counts={analytics.masteryDistribution} labels={STATUS_LABEL} />
          </CardContent>
        </Card>
        <LevelCard xp={gamification.xp} level={gamification.level} streakDays={gamification.streakDays} unlockedCount={gamification.unlockedCount} total={ACHIEVEMENTS.length} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-primary" aria-hidden="true" />
              Daily and weekly goals
            </CardTitle>
            <CardDescription>Measured from your sessions, reviews, answers and mastery; a reached goal earns XP.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {goals.length === 0 ? <p className="text-sm text-muted-foreground">No goals yet. Study 60 minutes today, review 50 flashcards this week, reach 80% mastery of a material…</p> : <GoalList goals={goals.slice(0, 5)} compact />}
            <div className="flex flex-wrap gap-2">
              <NewGoalButton materials={readyMaterials} today={clock.today} />
              <Link href={routes.planner} className={buttonClasses({ size: "sm", variant: "ghost" })}>
                Manage in Planner
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>What to do next</CardTitle>
            <CardDescription>Chosen from your mastery, confidence, due reviews and open mistakes — with the reason.</CardDescription>
          </CardHeader>
          <CardContent>
            <RecommendationList items={recommendations} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Confidence check</CardTitle>
            <CardDescription>Where what you feel and what you know disagree.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger">Wrong but confident</p>
              {summary.misconceptions.length === 0 ? (
                <p className="text-muted-foreground">None — good calibration.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {summary.misconceptions.slice(0, 5).map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{row.concept?.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{row.misconceptions}×</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Treated as misconceptions: explain them in your own words before more drilling.</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">Right but unsure</p>
              {summary.underconfident.length === 0 ? (
                <p className="text-muted-foreground">None yet.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {summary.underconfident.slice(0, 5).map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{row.concept?.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{row.underconfident}×</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-muted-foreground">You know these better than you think; timed practice builds the confidence.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="mastery-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="mastery-heading" className={SECTION_TITLE}>
            Concept mastery
          </h2>
          <p className="text-xs text-muted-foreground">{STATUS_BANDS}. Mastery is how likely you know it times how well you can recall it today, so it fades until the next review.</p>
        </div>
        {practiced.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="No concepts tracked yet"
            description="Take a quiz or an active recall session. Every answer updates the mastery of its concept, and this table fills in."
            action={
              <Link href={routes.study} className={buttonClasses({ size: "sm" })}>
                Start a session
              </Link>
            }
          />
        ) : (
          <MasteryTable rows={practiced} />
        )}
      </section>
    </div>
  );
}
