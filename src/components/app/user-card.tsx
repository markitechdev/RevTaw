import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { BADGE_ICONS } from "@/components/gamification/badge-icons";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { Standing } from "@/lib/gamification/standing";
import { formatXp } from "@/lib/gamification/xp";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function initialsFor(name: string, email: string | null): string {
  const source = name.trim() || email?.split("@")[0] || "";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const RING_RADIUS = 16.5;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Initials inside a ring that fills as the student works through the current level. */
function LevelAvatar({ initials, percent }: { initials: string; percent: number }) {
  return (
    <span aria-hidden="true" className="relative flex h-10 w-10 shrink-0 items-center justify-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="18" cy="18" r={RING_RADIUS} fill="none" strokeWidth="2.5" className="stroke-primary-soft" />
        {percent > 0 && (
          <circle
            cx="18"
            cy="18"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - Math.min(100, percent) / 100)}
            className="stroke-primary"
          />
        )}
      </svg>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{initials}</span>
    </span>
  );
}

/**
 * Who is signed in and how far they have come: the name with the level, XP
 * and newest badges under it (linking to the badges page), plus the theme
 * and sign-out controls.
 */
export function UserCard({
  displayName,
  email,
  standing,
  className,
}: {
  displayName: string;
  /** Only used for the initials when there is no name yet. */
  email: string | null;
  standing: Standing;
  className?: string;
}) {
  const { level, xp, badges, recent } = standing;
  const xpText = `${formatXp(xp)} XP`;
  const badgeText = badges === 0 ? "No badges yet" : `${badges} badge${badges === 1 ? "" : "s"}`;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3">
        <LevelAvatar initials={initialsFor(displayName, email)} percent={level.percent} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{displayName || "Student"}</p>
          {/* The link's name is what it shows (plus a hidden "how far to the next level"), so it can be said aloud. */}
          <Link
            href={routes.achievements}
            className="-mx-1 mt-0.5 flex flex-col gap-1 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span className="flex items-center gap-1 whitespace-nowrap">
              <span className="font-semibold text-primary">Level {level.level}</span>
              <span aria-hidden="true">·</span>
              <span className="sr-only">, </span>
              <span className="tabular-nums">{xpText}</span>
            </span>
            <span className="flex items-center gap-1.5">
              {recent.length > 0 && (
                <span className="flex -space-x-1" aria-hidden="true">
                  {recent.map((achievement) => {
                    const Icon = BADGE_ICONS[achievement.icon];
                    return (
                      <span key={achievement.key} title={achievement.title} className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                        <Icon className="h-3 w-3" />
                      </span>
                    );
                  })}
                </span>
              )}
              <span className="truncate">{badgeText}</span>
            </span>
            <span className="sr-only">
              . {formatXp(level.toNext)} XP to level {level.level + 1}. See badges and XP history
            </span>
          </Link>
        </div>
      </div>
      {/* One row on the 16 rem sidebar; with touch-sized segments, Sign out moves below instead of squeezing. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ThemeToggle className="shrink-0" />
        <SignOutButton variant="ghost" size="sm" className="whitespace-nowrap px-2" />
      </div>
    </div>
  );
}
