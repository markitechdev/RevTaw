import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * One of Tamari's lines as part of a page (a plan's intro, its reaction when
 * the plan is done): a soft card with the words. Tamari's picture lives on
 * Home only, so here Tamari speaks through the card.
 */
export function TamariSays({ text, detail, children, className }: { text: string; detail?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-primary/30 bg-primary-soft/40 p-4 sm:p-5", className)}>
      <p className="font-display text-base leading-snug font-semibold text-foreground sm:text-lg">
        <span className="sr-only">Tamari says: </span>
        {text}
      </p>
      {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
      {children}
    </div>
  );
}
