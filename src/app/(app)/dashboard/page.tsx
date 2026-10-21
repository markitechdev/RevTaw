import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { Suspense, type ReactNode } from "react";

import { DashboardBoard } from "@/components/dashboard/board";
import { ContinueWidget, DueTodayWidget, RecommendationWidget } from "@/components/dashboard/focus-widgets";
import { ExamWidget, MasteryWidget, StreakWidget, StudyTimeWidget } from "@/components/dashboard/glance-widgets";
import { FlashcardsWidget, GoalsWidget, PlannerWidget, RecentMaterialsWidget, WeakTopicsWidget } from "@/components/dashboard/list-widgets";
import { HeroSkeleton, WidgetSkeleton } from "@/components/dashboard/widget-shell";
import { Alert } from "@/components/forms/form-alert";
import { TamariHome } from "@/components/tamari/tamari-home";
import { syncGamification } from "@/lib/gamification/sync";
import { syncNotifications } from "@/lib/notifications/service";
import { hourIn } from "@/lib/planner/dates";
import { plannerClock, rebalanceAllPlans } from "@/lib/planner/service";
import { getPreferences } from "@/lib/preferences/queries";
import type { ResponseLanguage, WidgetId } from "@/lib/preferences/schema";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { routes } from "@/lib/routes";
import { LATER_COOKIE, parseLater } from "@/lib/tamari/coach";
import { homeLine } from "@/lib/tamari/hints";

export const metadata: Metadata = {
  title: "Home",
};

const NOTICES: Record<string, string> = {
  "password-updated": "Your password has been updated. Other devices have been signed out.",
  welcome: "You're all set. Upload your first material and RevTaw turns it into reviewers, quizzes and flashcards.",
};

/** A short line under the greeting; changes daily, Filipino now and then (UI phase §3). */
const LINES = ["Bitaw na. Let's review.", "Small steps, every day.", "Kaya 'yan — one session at a time.", "Review a little now, remember a lot later."];

function greetingFor(timezone: string | null, name: string | undefined): string {
  const hour = hourIn(new Date(), timezone);
  // Late-night studying gets a question instead of a greeting.
  if (hour < 5) return name ? `Still up, ${name}?` : "Still up?";
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${greeting}, ${name}.` : `${greeting}.`;
}

/** Home's Tamari with its line (streams in on its own; a failure just means Tamari offers to plan instead). */
async function HomeTamari({ language, planning, today, size, lgSize }: { language: ResponseLanguage; planning: Promise<unknown>; today: string; size: number; lgSize: number }) {
  let line = null;
  try {
    const later = parseLater((await cookies()).get(LATER_COOKIE)?.value, today);
    line = await homeLine(language, planning, later);
  } catch (error) {
    unstable_rethrow(error);
    console.error("dashboard: Tamari's line failed", error);
  }
  return <TamariHome line={line} today={today} size={size} lgSize={lgSize} />;
}

function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
}

/**
 * Home (UI phase §5–§8): what to do now first — continue, one recommendation,
 * what is due — then compact numbers. Each widget streams in on its own, and
 * hidden widgets are not loaded at all.
 */
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const { user, profile } = await getCurrentUserWithProfile();
  if (!user) redirect(routes.login);
  const [preferences, clock] = await Promise.all([getPreferences(), plannerClock()]);

  // Plans adjust before anything reads today's tasks (widgets that show plan data wait for
  // this); XP, badges and reminders are brought up to date next, alongside the page. The
  // streak tile waits for them, and after() keeps the request alive until they finish.
  const planning = rebalanceAllPlans().catch((error: unknown) => {
    console.error("dashboard: plan rebalance failed", error);
    return [];
  });
  const syncs = planning.then(() => Promise.allSettled([syncGamification(), syncNotifications()]));
  after(syncs);

  const layout = preferences.dashboard;
  const shown = new Set(layout.order.filter((id) => !layout.hidden.includes(id)));
  const stream = (id: WidgetId, variant: "hero" | "panel" | "tile" | "list", element: ReactNode) =>
    shown.has(id) ? <Suspense fallback={<WidgetSkeleton variant={variant} />}>{element}</Suspense> : undefined;
  // Tamari leads the "Continue studying" card (already there while the card loads); with that card hidden, the greeting.
  const waiting = (size: number, lgSize: number) => <TamariHome line={null} today={clock.today} pending size={size} lgSize={lgSize} />;
  const tamari = (size: number, lgSize: number) => (
    <Suspense fallback={waiting(size, lgSize)}>
      <HomeTamari language={preferences.ai.language} planning={planning} today={clock.today} size={size} lgSize={lgSize} />
    </Suspense>
  );

  const widgets: Partial<Record<WidgetId, ReactNode>> = {
    continue: shown.has("continue") ? (
      <Suspense fallback={<HeroSkeleton tamari={waiting(72, 96)} />}>
        <ContinueWidget tamari={tamari(72, 96)} />
      </Suspense>
    ) : undefined,
    recommendation: stream("recommendation", "panel", <RecommendationWidget />),
    due: stream("due", "panel", <DueTodayWidget planning={planning} />),
    exam: stream("exam", "tile", <ExamWidget planning={planning} />),
    streak: stream("streak", "tile", <StreakWidget syncs={syncs} />),
    time: stream("time", "tile", <StudyTimeWidget />),
    mastery: stream("mastery", "tile", <MasteryWidget />),
    recent: stream("recent", "list", <RecentMaterialsWidget />),
    weak: stream("weak", "list", <WeakTopicsWidget />),
    flashcards: stream("flashcards", "list", <FlashcardsWidget />),
    goals: stream("goals", "list", <GoalsWidget />),
    planner: stream("planner", "list", <PlannerWidget planning={planning} />),
  };

  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const firstName = profile?.display_name?.trim().split(/\s+/)[0];
  const line = LINES[Number(clock.today.replaceAll("-", "")) % LINES.length];

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert tone="success">{notice}</Alert>}
      <DashboardBoard
        layout={layout}
        widgets={widgets}
        stage={shown.has("continue") ? undefined : tamari(64, 80)}
        header={
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{longDate(clock.today)}</p>
            <h1 className="mt-0.5 text-[1.75rem] font-bold leading-tight text-foreground sm:text-3xl">{greetingFor(clock.timezone, firstName)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{line}</p>
          </div>
        }
      />
    </div>
  );
}
