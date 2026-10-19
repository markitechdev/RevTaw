import {
  BookOpenCheck,
  CalendarDays,
  Clock,
  Flame,
  FolderOpen,
  Layers,
  Sparkles,
  Target,
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
import { SOURCE_LABEL } from "@/lib/materials/constants";
import { countMaterials, listRecentMaterials } from "@/lib/materials/queries";
import { formatSessionMinutes, STUDY_GOAL_LABEL } from "@/lib/profile/options";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
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

  const [materialCount, recentMaterials] = await Promise.all([countMaterials(), listRecentMaterials(5)]);
  const lastOpened = recentMaterials.find((material) => material.last_opened_at) ?? recentMaterials[0];

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
            ) : (
              <p>
                Open a material&apos;s overview to see its recommended study methods. Quizzes and
                guided sessions built from your materials arrive in the next phases, and that is when
                RevTaw starts tracking what you get wrong.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Flame} label="Study streak" value="0 days" caption="Finish a session to start one." />
        <StatCard icon={Clock} label="Focus time today" value="0 min" caption="Sessions count toward this." />
        <StatCard icon={Layers} label="Flashcards due" value="0" caption="Generate flashcards from a reviewer." />
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
            <EmptyState
              compact
              icon={CalendarDays}
              title="Nothing due"
              description="Reviews appear here once you rate flashcards or finish a quiz."
            />
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Weak topics</CardTitle>
            <CardDescription>Concepts that need attention.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              compact
              icon={TrendingUp}
              title="Not enough data yet"
              description="RevTaw tracks mistakes at the concept level, so a couple of quizzes are enough to see patterns."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Strong topics</CardTitle>
            <CardDescription>High-mastery concepts.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              compact
              icon={TrendingUp}
              title="Nothing mastered yet"
              description="Topics move here once you answer their questions correctly across several sessions."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
