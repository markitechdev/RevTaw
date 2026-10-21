"use client";

import type { ReactNode } from "react";

import { useTamari } from "@/components/assistant/assistant-provider";
import { TamariPerch } from "@/components/tamari/tamari-perch";
import type { TamariState } from "@/lib/tamari/states";
import { cn } from "@/lib/utils";

/**
 * One of Tamari's lines as part of a page (a plan's intro, its reaction when
 * the plan is done): a card with Tamari sitting on its top edge. With Tamari
 * hidden in Settings the card keeps the words and loses the picture.
 */
export function TamariSays({ text, detail, state = "idle", children, className }: { text: string; detail?: ReactNode; state?: TamariState; children?: ReactNode; className?: string }) {
  const tamari = useTamari();
  const seated = tamari?.visible ?? false;
  return (
    <div className={cn("relative rounded-2xl border border-primary/30 bg-primary-soft/40 p-4 sm:p-5", seated && "mt-[4.25rem] sm:mt-[4.75rem]", className)}>
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
