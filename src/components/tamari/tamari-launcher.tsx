"use client";

import { MessageCircle } from "lucide-react";
import type { Ref } from "react";

import { TamariSprite } from "@/components/tamari/tamari-sprite";
import { TAMARI_STATES, type TamariReaction, type TamariState } from "@/lib/tamari/states";
import { cn } from "@/lib/utils";

/**
 * Tamari in the corner (mascot doc §1, §5, §19): a small round button with
 * Tamari in it, above the phone tab bar and clear of page actions (pages that
 * need the corner on phones show it from the lg breakpoint only). The round
 * card keeps Tamari readable over whatever scrolls underneath. Clicking opens
 * the chat; the picture and its words follow what Tamari is doing. With
 * Tamari turned off in Settings it is a plain chat button that does the same.
 */
export function TamariLauncher({
  state,
  reaction = null,
  mode,
  mascot,
  animate,
  onOpen,
  ref,
}: {
  state: TamariState;
  reaction?: { kind: TamariReaction; key: number } | null;
  mode: "visible" | "desktop";
  mascot: boolean;
  animate: boolean;
  onOpen: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  const status = TAMARI_STATES[state].status;
  const place = cn("fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 lg:right-6 lg:bottom-6", mode === "desktop" ? "hidden lg:block" : "block");
  if (!mascot) {
    return (
      <div className={place}>
        <button
          ref={ref}
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card p-3 text-sm font-semibold text-foreground shadow-pop transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 sm:px-4"
        >
          <MessageCircle className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Ask Tamari</span>
        </button>
      </div>
    );
  }
  return (
    <div data-tamari-corner="" className={cn("tamari-enter", place)}>
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-label={state === "idle" ? "Ask Tamari" : `Ask Tamari (${status})`}
        title="Ask Tamari"
        className="group relative block cursor-pointer rounded-full border border-border bg-card p-1 shadow-pop lg:p-1.5"
      >
        <span className="block group-hover:-translate-y-0.5 group-active:translate-y-0">
          <TamariSprite state={state} size={44} lgSize={60} animate={animate} reaction={reaction?.kind ?? null} reactionKey={reaction?.key} />
        </span>
      </button>
    </div>
  );
}
