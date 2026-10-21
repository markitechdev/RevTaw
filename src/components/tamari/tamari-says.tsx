"use client";

import type { ReactNode } from "react";

import { useTamari } from "@/components/assistant/assistant-provider";
import { TamariPerch } from "@/components/tamari/tamari-perch";
import type { TamariState } from "@/lib/tamari/states";
import { cn } from "@/lib/utils";

/**
 * One of Tamari's lines as part of a page (a plan's intro, its reaction when
 * the plan is done): a card with Tamari sitting on its top edge. The card's
 * top margin leaves room for the whole character (88 px, 104 px from lg) so its
 * horns clear whatever sits above. With Tamari hidden in Settings the card
 * keeps the words and loses the picture.
 */
export function TamariSays({ text, detail, state = "idle", children, className }: { text: string; detail?: ReactNode; state?: TamariState; children?: ReactNode; className?: string }) {
  const tamari = useTamari();
  const seated = tamari?.visible ?? false;
  return (
    <div className={cn("relative rounded-2xl border border-primary/30 bg-primary-soft/40 p-4 sm:p-5", seated && "mt-[4.75rem] lg:mt-[5.75rem]", className)}>
      {seated && <TamariPerch state={state} size={88} lgSize={104} className="absolute bottom-[calc(100%-14px)] left-2 sm:left-4" />}
      <p className="font-display text-base leading-snug font-semibold text-foreground sm:text-lg">
        <span className="sr-only">Tamari says: </span>
        {text}
      </p>
      {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
      {children}
    </div>
  );
}
