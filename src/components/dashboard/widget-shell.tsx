import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Frames for dashboard widgets. Focus widgets are panels with a real heading;
 * the compact "at a glance" stats share one strip (tiles separated by hairlines,
 * not a grid of cards); list widgets are quiet panels with dividers.
 */

export function WidgetHeading({ id, icon: Icon, title, action }: { id?: string; icon?: LucideIcon; title: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="flex items-center gap-2 font-sans text-sm font-semibold tracking-normal text-foreground">
        {Icon && <Icon className="h-4 w-4 text-primary" aria-hidden="true" />}
        {title}
      </h2>
      {action && (
        <Link href={action.href} className="shrink-0 rounded text-xs font-medium text-primary hover:underline">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function WidgetPanel({ children, className, labelledBy }: { children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section aria-labelledby={labelledBy} className={cn("flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5", className)}>
      {children}
    </section>
  );
}

/** One tile of the at-a-glance strip: a label, a big value and a short line. */
export function StatTile({ icon: Icon, label, value, unit, caption, href, children }: { icon: LucideIcon; label: string; value: ReactNode; unit?: string; caption?: ReactNode; href?: string; children?: ReactNode }) {
  const body = (
    <>
      <h2 className="flex items-center gap-1.5 font-sans text-xs font-semibold tracking-normal text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </h2>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="font-display text-3xl font-bold leading-none tabular-nums text-foreground">{value}</span>
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
      </p>
      {caption && <p className="mt-1.5 text-xs text-muted-foreground">{caption}</p>}
      {children}
    </>
  );
  return (
    <section className="relative flex h-full flex-col bg-card p-4 sm:p-5">
      {body}
      {href && <Link href={href} className="absolute inset-0 outline-offset-[-3px] transition-colors hover:bg-muted/40" aria-label={`${label}: open details`} />}
    </section>
  );
}

/** Same footprint as the widget it stands in for, so nothing jumps when it streams in. */
export function WidgetSkeleton({ variant }: { variant: "hero" | "panel" | "tile" | "list" }) {
  if (variant === "tile") {
    return (
      <div className="flex h-full min-h-[7.5rem] flex-col gap-3 bg-card p-4 sm:p-5" aria-hidden="true">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-28" />
      </div>
    );
  }
  return (
    <div className={cn("flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5", variant === "hero" ? "min-h-[11rem]" : variant === "list" ? "min-h-[13rem]" : "min-h-[14rem]")} aria-hidden="true">
      <Skeleton className="h-4 w-32" />
      <Skeleton className={cn(variant === "hero" ? "h-8 w-2/3" : "h-5 w-3/4")} />
      <Skeleton className="h-3 w-1/2" />
      <div className="mt-auto flex gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
    </div>
  );
}

/**
 * The "Continue studying" card while it loads, shaped like the card itself,
 * with Home's Tamari already at its start (`tamari`) — so Tamari is there from
 * the first paint and nothing jumps when the card arrives.
 */
export function HeroSkeleton({ tamari }: { tamari?: ReactNode }) {
  return (
    <div className="@container relative h-full min-h-[11rem] rounded-2xl border border-border bg-card">
      <div className="flex h-full flex-col gap-4 p-4 sm:p-5 @2xl:flex-row @2xl:items-end @2xl:justify-between @2xl:gap-6 @2xl:p-6 @2xl:pr-16">
        <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-y-3 has-[[data-tamari-stage]]:gap-x-4 @2xl:gap-y-1.5 @2xl:has-[[data-tamari-stage]]:gap-x-5">
          <div className="@2xl:row-span-2">{tamari}</div>
          <div className="flex min-w-0 flex-col gap-2.5 pr-8 @2xl:pr-0" aria-hidden="true">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-7 w-3/4" />
          </div>
          <div className="col-span-2 @2xl:col-span-1 @2xl:col-start-2" aria-hidden="true">
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <div className="flex gap-2 *:flex-1 @2xl:*:flex-none" aria-hidden="true">
          <Skeleton className="h-11 rounded-lg @2xl:h-12 @2xl:w-32" />
          <Skeleton className="h-11 rounded-lg @2xl:h-12 @2xl:w-36" />
        </div>
      </div>
    </div>
  );
}
