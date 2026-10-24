"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { STALE_AFTER_MS } from "@/lib/generation/stale";

/**
 * Checks quickly while the work is likely to finish, then less often, and stops a minute after the point
 * where the server reports unfinished work as stopped (the page then shows Try again).
 */
const CHECK_DELAYS_MS = [2500, 2500, 2500, 2500, 5000, 5000, 5000, 10_000, 10_000];
const LATER_DELAY_MS = 20_000;
const CHECK_FOR_MS = STALE_AFTER_MS + 60_000;

/**
 * Work in progress (notes, a quiz or a deck being written): a calm status, not an error, that reloads the
 * page's data by itself until the work is done, so nobody has to press Refresh.
 */
export function GeneratingState({ title, description }: { title: string; description: string }) {
  const router = useRouter();

  useEffect(() => {
    let canceled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const schedule = () => {
      if (canceled || Date.now() - started > CHECK_FOR_MS) return;
      const delay = CHECK_DELAYS_MS[attempt] ?? LATER_DELAY_MS;
      attempt += 1;
      timer = setTimeout(() => {
        if (canceled) return;
        // A hidden tab waits; it checks again when it comes back.
        if (document.visibilityState === "visible") router.refresh();
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      canceled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  return (
    <div role="status" className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/40 px-6 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-primary">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
