import { Brain, Gauge, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MasteryTable } from "@/components/adaptive/mastery-table";
import { RecommendationList } from "@/components/adaptive/recommendation-list";
import { StatCard } from "@/components/dashboard/stat-card";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getMasterySummary, listMastery } from "@/lib/adaptive/engine";
import { MASTERY_THRESHOLD } from "@/lib/adaptive/mastery";
import { getRecommendations } from "@/lib/adaptive/recommend";
import { routes } from "@/lib/routes";
import { getActivityStats } from "@/lib/study/queries";

export const metadata: Metadata = {
  title: "Progress",
};

export default async function ProgressPage() {
  const [rows, summary, recommendations, activity] = await Promise.all([listMastery(), getMasterySummary(), getRecommendations(3), getActivityStats()]);
  const practiced = rows.filter((row) => row.attempts > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Progress"
        description={`Mastery per concept from every quiz, recall prompt, Feynman round and flashcard review. A concept counts as mastered at ${MASTERY_THRESHOLD}%; nothing is ever locked — RevTaw just recommends more practice.`}
        actions={
          <Link href={`${routes.study}?method=smart_study`} className={buttonClasses({ size: "sm" })}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Smart Study
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Brain} label="Concepts tracked" value={String(summary.total)} caption={summary.total === 0 ? "Answer questions to start tracking." : `${summary.mastered.length} mastered · ${summary.weak.length} weak`} />
        <StatCard icon={Gauge} label="Average mastery" value={summary.averageMastery === null ? "—" : `${summary.averageMastery}%`} caption={summary.averageMastery === null ? "No answers yet." : summary.averageMastery >= MASTERY_THRESHOLD ? "Above the mastery line." : "Weak concepts pull this down."} />
        <StatCard icon={ShieldAlert} label="Possible misconceptions" value={String(summary.misconceptions.length)} caption={summary.misconceptions.length ? "Confident but wrong — see below." : "No confident wrong answers."} />
        <StatCard icon={TrendingUp} label="Sessions completed" value={String(activity.sessionsCompleted)} caption={`${activity.streakDays}-day streak · ${Math.round(activity.focusSecondsWeek / 60)} min this week`} />
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
          <h2 id="mastery-heading" className="text-lg font-semibold">
            Concept mastery
          </h2>
          <p className="text-xs text-muted-foreground">Weak &lt; 40 · Learning 40–59 · Strong 60–79 · Mastered ≥ {MASTERY_THRESHOLD}. Recall strength fades until the next review.</p>
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
