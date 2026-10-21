"use client";

import type { Ref } from "react";

import { TamariSprite } from "@/components/tamari/tamari-sprite";
import { TAMARI_STATES, type TamariState } from "@/lib/tamari/states";
import { cn } from "@/lib/utils";

/**
 * Tamari in the corner (mascot doc §1, §5, §19): a small round button with
 * Tamari in it, above the phone tab bar and clear of page actions (pages that
 * need the corner on phones show it from the lg breakpoint only). The round
 * card keeps Tamari readable over whatever scrolls underneath. Clicking opens
 * the chat; the picture and its words follow what Tamari is doing.
 */
export function TamariLauncher({ state, mode, ambient, onOpen, ref }: { state: TamariState; mode: "visible" | "desktop"; ambient: boolean; onOpen: () => void; ref?: Ref<HTMLButtonElement> }) {
  const status = TAMARI_STATES[state].status;
  return (
    <div className={cn("tamari-enter fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 lg:right-6 lg:bottom-6", mode === "desktop" ? "hidden lg:block" : "block")}>
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
          <TamariSprite state={state} size={44} lgSize={60} ambient={ambient} />
        </span>
      </button>
    </div>
  );
}
