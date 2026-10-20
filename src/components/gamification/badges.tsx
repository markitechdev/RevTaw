import { Award, BookOpen, Brain, Castle, Clock, Compass, Flame, GraduationCap, Layers, ListChecks, Lock, Play, Sparkles, Target, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ACHIEVEMENT_GROUP_LABEL, type AchievementDef, type AchievementGroup } from "@/lib/gamification/achievements";
import { formatXp, type LevelInfo } from "@/lib/gamification/xp";
import { routes } from "@/lib/routes";
import type { XpEvent } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/**
 * Gamification UI (§31): a level card with the XP bar and streak, the badge
 * grid with progress towards locked ones, and the XP history. Server-safe
 * markup; plain, not childish.
 */

const ICONS: Record<AchievementDef["icon"], LucideIcon> = {
  play: Play,
  layers: Layers,
  "list-checks": ListChecks,
  flame: Flame,
  award: Award,
  brain: Brain,
  compass: Compass,
  clock: Clock,
  target: Target,
  "trending-up": TrendingUp,
  castle: Castle,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  sparkles: Sparkles,
};

const GROUP_ORDER: AchievementGroup[] = ["sessions", "methods", "answers", "reviews", "streak", "mastery", "milestones"];

export function LevelBar({ level, className }: { level: LevelInfo; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="h-2 overflow-hidden rounded-full bg-primary-soft" role="progressbar" aria-label={`Level ${level.level} progress`} aria-valuenow={level.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${level.percent}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {formatXp(level.into)} / {formatXp(level.span)} XP · {formatXp(level.toNext)} to level {level.level + 1}
      </p>
    </div>
  );
}

/** Level, XP and streak at a glance, with the badge count. */
export function LevelCard({ xp, level, streakDays, unlockedCount, total, compact = false }: { xp: number; level: LevelInfo; streakDays: number; unlockedCount: number; total: number; compact?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" aria-hidden="true" />
          Level {level.level}
        </CardTitle>
        <CardDescription>{formatXp(xp)} XP from answers, finished sessions, mastered concepts, goals and active days.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <LevelBar level={level} />
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Streak</dt>
            <dd className="flex items-center gap-1 font-semibold tabular-nums">
              <Flame className={cn("h-4 w-4", streakDays > 0 ? "text-warning" : "text-muted-foreground")} aria-hidden="true" />
              {streakDays} day{streakDays === 1 ? "" : "s"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Badges</dt>
            <dd className="font-semibold tabular-nums">
              {unlockedCount} of {total}
            </dd>
          </div>
        </dl>
        {!compact && (
          <Link href={`${routes.progress}/achievements`} className={buttonClasses({ size: "sm", variant: "secondary", className: "self-start" })}>
            See badges and XP history
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

export type BadgeView = { achievement: AchievementDef; unlockedAt: string | null; progress: number };

export function BadgeTile({ view }: { view: BadgeView }) {
  const { achievement, unlockedAt, progress } = view;
  const Icon = ICONS[achievement.icon];
  const target = achievement.target ?? 1;
  const percent = Math.min(100, Math.round((Math.min(progress, target) / target) * 100));
  return (
    <li className={cn("flex gap-3 rounded-xl border p-3", unlockedAt ? "border-primary/40 bg-primary-soft/30" : "border-border bg-card")} aria-label={`${achievement.title}: ${unlockedAt ? "unlocked" : "locked"}`}>
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", unlockedAt ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")} aria-hidden="true">
        {unlockedAt ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {achievement.title}
          {unlockedAt && <Badge tone="success">Unlocked</Badge>}
        </p>
        <p className="text-sm text-muted-foreground">{achievement.description}</p>
        {unlockedAt ? (
          <p className="text-xs text-muted-foreground">{new Date(unlockedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${achievement.title} progress`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-muted-foreground/60" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.min(progress, target).toLocaleString("en-US")} / {target.toLocaleString("en-US")}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

/** Every badge, grouped; unlocked ones first within each group. */
export function BadgeGrid({ badges }: { badges: BadgeView[] }) {
  return (
    <div className="flex flex-col gap-6">
      {GROUP_ORDER.map((group) => {
        const items = badges.filter((badge) => badge.achievement.group === group).sort((a, b) => Number(Boolean(b.unlockedAt)) - Number(Boolean(a.unlockedAt)));
        if (items.length === 0) return null;
        return (
          <section key={group} aria-labelledby={`badges-${group}`} className="flex flex-col gap-3">
            <h3 id={`badges-${group}`} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {ACHIEVEMENT_GROUP_LABEL[group]} · {items.filter((item) => item.unlockedAt).length}/{items.length}
            </h3>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <BadgeTile key={item.achievement.key} view={item} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const SOURCE_LABEL: Record<XpEvent["source"], string> = {
  answers: "Quiz answers",
  session: "Session",
  reviews: "Reviews",
  mastered: "Concept mastered",
  goal: "Goal reached",
  streak_day: "Active day",
  achievement: "Badge",
};

export function XpHistory({ events }: { events: XpEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No XP yet. Finish a session or answer a quiz to earn the first points.</p>;
  return (
    <ol className="flex flex-col divide-y divide-border text-sm" aria-label="Recent XP">
      {events.map((event) => (
        <li key={event.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="truncate font-medium">{event.label ?? SOURCE_LABEL[event.source]}</p>
            <p className="text-xs text-muted-foreground">
              {SOURCE_LABEL[event.source]} · {new Date(event.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          </div>
          <span className="shrink-0 font-semibold tabular-nums text-primary">+{event.points} XP</span>
        </li>
      ))}
    </ol>
  );
}
