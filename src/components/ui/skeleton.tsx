import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Placeholder block shown while content loads. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

/*
 * Loading placeholders shaped like the pages they stand in for (each route's
 * loading.tsx), so the page settles into place instead of jumping when it
 * arrives. One live region per placeholder says "Loading…" to screen readers;
 * the blocks themselves are decorative. Under Reduce motion the pulse stops
 * (globals.css).
 */

/** The live wrapper every page placeholder uses. */
export function LoadingRegion({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-6", className)} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** The title block at the top of every page, with room for its description and action buttons. */
export function HeaderSkeleton({ actions = 1, lines = 2, back = false, eyebrow = false }: { actions?: number; lines?: 1 | 2; back?: boolean; eyebrow?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {back && <Skeleton className="h-4 w-28" />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          {eyebrow && <Skeleton className="h-4 w-32" />}
          <Skeleton className="h-8 w-48 max-w-full" />
          <Skeleton className="h-4 w-[28rem] max-w-full" />
          {lines === 2 && <Skeleton className="h-4 w-80 max-w-full" />}
        </div>
        {actions > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {Array.from({ length: actions }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-32 rounded-lg" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A card in the three-column grids (Materials, Notes, Quiz, Flashcards, AI Tutor). */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-40 flex-col gap-3 rounded-xl border border-border bg-card p-4", className)} aria-hidden="true">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="mt-auto h-3 w-2/5" />
    </div>
  );
}

export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }).map((_, index) => (
        <CardSkeleton key={index} />
      ))}
    </div>
  );
}

/** A panel with a heading, a line under it and a few rows (planner panels, study tools, settings sections). */
export function PanelSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-2xl border border-border bg-card p-5", className)} aria-hidden="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** Loading placeholder for a typical page: heading, subtitle and card grid (the app-wide fallback). */
export function PageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <LoadingRegion>
      <HeaderSkeleton actions={1} />
      <CardGridSkeleton cards={cards} />
    </LoadingRegion>
  );
}

/** Materials: the subject browser beside the card grid. */
export function BrowsePageSkeleton() {
  return (
    <LoadingRegion>
      <HeaderSkeleton actions={1} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]">
        <div className="flex flex-col gap-2 pl-3" aria-hidden="true">
          <Skeleton className="mb-1 h-3 w-16" />
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full rounded-lg" />
          ))}
        </div>
        <CardGridSkeleton cards={6} />
      </div>
    </LoadingRegion>
  );
}

/**
 * A material, reviewer, quiz, deck or exam: the way back, badges, the title,
 * its meta line and actions, then its panels (`columns` 2 puts a narrow panel
 * beside the main one, as the quiz and exam pages do).
 */
export function DetailPageSkeleton({ tabs = false, columns = 1 }: { tabs?: boolean; columns?: 1 | 2 }) {
  return (
    <LoadingRegion>
      <div className="flex flex-col gap-4" aria-hidden="true">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-8 w-2/3 max-w-xl" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
        {tabs && (
          <div className="flex gap-6 border-b border-border pb-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        )}
      </div>
      {columns === 2 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <PanelSkeleton rows={2} />
          <PanelSkeleton rows={1} />
        </div>
      ) : (
        <>
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={2} />
        </>
      )}
    </LoadingRegion>
  );
}

/** Planner: today's tasks beside the goals panel. */
export function PlannerPageSkeleton() {
  return (
    <LoadingRegion>
      <HeaderSkeleton actions={2} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5" aria-hidden="true">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-2 w-full rounded-full" />
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <Skeleton className="h-5 w-1/2" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-20 rounded-lg" />
                  <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
        <PanelSkeleton rows={2} />
      </div>
    </LoadingRegion>
  );
}

/** Progress: two rows of number tiles, then charts. */
export function ProgressPageSkeleton() {
  return (
    <LoadingRegion>
      <HeaderSkeleton actions={3} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex min-h-[7.25rem] flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** Study: the continue card, then the session builder beside routines and memory aids. */
export function StudyPageSkeleton() {
  return (
    <LoadingRegion>
      <HeaderSkeleton actions={2} />
      <PanelSkeleton rows={2} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5" aria-hidden="true">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-72 max-w-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-4 w-36" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <PanelSkeleton rows={1} />
          <PanelSkeleton rows={1} />
        </div>
      </div>
    </LoadingRegion>
  );
}

/** A settings section: its card with a few fields. */
export function SettingsPageSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <LoadingRegion className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3 w-80 max-w-full" />
      </div>
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full max-w-md rounded-lg" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
      ))}
    </LoadingRegion>
  );
}

/** A conversation: the exchange so far and the box to type in. */
export function ChatPageSkeleton() {
  return (
    <LoadingRegion>
      <HeaderSkeleton back actions={1} lines={1} />
      <div className="flex flex-col gap-4" aria-hidden="true">
        <Skeleton className="h-16 w-3/4 self-start rounded-2xl" />
        <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
        <Skeleton className="h-28 w-3/4 self-start rounded-2xl" />
        <Skeleton className="h-10 w-2/5 self-end rounded-2xl" />
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
    </LoadingRegion>
  );
}

/** A single-column list of rows (the mistake notebook, search results). */
export function ListPageSkeleton({ rows = 5, actions = 2 }: { rows?: number; actions?: number }) {
  return (
    <LoadingRegion>
      <HeaderSkeleton actions={actions} />
      <div className="flex flex-col gap-3" aria-hidden="true">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
