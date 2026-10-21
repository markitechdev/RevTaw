"use client";

import { MessageCircle } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { TamariSprite } from "@/components/tamari/tamari-sprite";
import { tamariStatus, type TamariLanguage } from "@/lib/tamari/lines";
import type { TamariReaction, TamariState } from "@/lib/tamari/states";
import { cn } from "@/lib/utils";

/**
 * Tamari on pages that do not seat it themselves (companion doc §1, §13):
 * peeking up from the bottom edge of the screen — from behind the tab bar on
 * phones — head and book showing, the rest out of sight. Not a button in a
 * circle: the character itself, at the edge of the layout. Pointing at it
 * lifts it a little; clicking it hops and opens the chat, and while the chat
 * is open on a wide screen Tamari peeks beside it and shows what the chat is
 * doing (listening, thinking, talking). Its speech bubble sits just above it.
 * With Tamari turned off in Settings it is a plain "Ask Tamari" button.
 */
export function TamariPeek({
  state,
  reaction = null,
  language,
  mode,
  mascot,
  animate,
  open,
  bubble,
  onOpen,
  ref,
}: {
  state: TamariState;
  reaction?: { kind: TamariReaction; key: number } | null;
  language: TamariLanguage;
  mode: "visible" | "desktop";
  mascot: boolean;
  animate: boolean;
  /** The chat is open: Tamari stays (beside the panel); the plain button steps aside. */
  open: boolean;
  bubble?: ReactNode;
  onOpen: (hop: boolean) => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  if (!mascot) {
    if (open) return null;
    return (
      <div className={cn("fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 lg:right-6 lg:bottom-6", mode === "desktop" ? "hidden lg:block" : "block")}>
        <button
          ref={ref}
          type="button"
          onClick={() => onOpen(false)}
          aria-haspopup="dialog"
          className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card p-3 text-sm font-semibold text-foreground shadow-pop transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 sm:px-4"
        >
          <MessageCircle className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Ask Tamari</span>
        </button>
      </div>
    );
  }

  const status = tamariStatus(state, language);
  return (
    <div
      data-tamari-corner=""
      className={cn(
        "tamari-enter fixed right-3 bottom-[calc(3.5625rem+env(safe-area-inset-bottom))] z-30 flex-col items-end lg:right-8 lg:bottom-0",
        mode === "desktop" ? "hidden lg:flex" : "flex",
      )}
    >
      {bubble}
      <button
        ref={ref}
        type="button"
        onClick={() => onOpen(true)}
        aria-haspopup="dialog"
        aria-label={state === "idle" ? "Ask Tamari" : `Ask Tamari (${status})`}
        title="Ask Tamari"
        className="group relative block h-[2.875rem] w-[4.5rem] cursor-pointer rounded-t-xl outline-offset-2 lg:h-[4.125rem] lg:w-[6.5rem]"
      >
        {/* Taller than the button: the lower part hangs below the screen edge (or behind the tab bar). */}
        <span className="absolute top-0 left-0 block group-hover:-translate-y-2 group-focus-visible:-translate-y-2">
          <TamariSprite state={state} size={72} lgSize={104} animate={animate} reaction={reaction?.kind ?? null} reactionKey={reaction?.key} />
        </span>
      </button>
    </div>
  );
}
