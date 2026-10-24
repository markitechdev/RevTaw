import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert } from "@/components/forms/form-alert";
import { BadgeGrid, LevelCard, XpHistory } from "@/components/gamification/badges";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SECTION_TITLE } from "@/components/ui/typography";
import { ACHIEVEMENTS } from "@/lib/gamification/achievements";
import { getGamificationView, syncGamification } from "@/lib/gamification/sync";
import { routes } from "@/lib/routes";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Badges and XP",
};

/** Achievements (§31): level, every badge with its rule and progress, and where the XP came from. */
export default async function AchievementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  // Unlock whatever the evidence now supports before reading the view.
  const fresh = await syncGamification();
  const view = await getGamificationView();

  return (
    <div className="flex flex-col gap-6">
      <Link href={routes.progress} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Progress
      </Link>
      <PageHeader title="Badges and XP" description="XP comes from evidence of learning — answers, finished sessions, mastered concepts, reached goals and active days — never from time spent idling. Badges mark milestones along the way." />
      {fresh.length > 0 && (
        <Alert tone="success">
          New badge{fresh.length === 1 ? "" : "s"}: {fresh.map((achievement) => achievement.title).join(", ")}.
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <LevelCard xp={view.xp} level={view.level} streakDays={view.streakDays} unlockedCount={view.unlockedCount} total={ACHIEVEMENTS.length} compact />
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent XP</CardTitle>
            <CardDescription>The last entries of the ledger; every point names its source.</CardDescription>
          </CardHeader>
          <CardContent>
            <XpHistory events={view.recentXp} />
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="badges-heading" className="flex flex-col gap-4">
        <h2 id="badges-heading" className={SECTION_TITLE}>
          Badges · {view.unlockedCount} of {ACHIEVEMENTS.length}
        </h2>
        <BadgeGrid badges={view.achievements} />
      </section>
    </div>
  );
}
