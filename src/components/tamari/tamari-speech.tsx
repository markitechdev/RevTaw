"use client";

import { X } from "lucide-react";

import type { TamariBubble } from "@/lib/tamari/lines";
import { cn } from "@/lib/utils";

/**
 * Tamari's speech bubble (mascot doc §11): a pixel-style card above Tamari
 * with one short line, an optional next step and a way to dismiss it. It
 * never covers the corner button and is announced to screen readers by the
 * provider's status line, not by this card.
 */
export function TamariSpeech({ bubble, mode, onAction, onDismiss }: { bubble: TamariBubble; mode: "visible" | "desktop"; onAction: () => void; onDismiss: () => void }) {
  return (
    <div
      className={cn(
        "tamari-enter fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom)+4.5rem)] z-40 w-[min(17rem,calc(100vw-1.5rem))] lg:right-6 lg:bottom-[7.25rem]",
        mode === "desktop" ? "hidden lg:block" : "block",
      )}
      data-tamari-bubble={bubble.id}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDismiss();
      }}
    >
      <div className="relative border-2 border-foreground bg-card px-3.5 py-3 text-foreground shadow-[4px_4px_0_0_var(--foreground)]">
        <p className="pr-7 text-sm leading-snug font-semibold">{bubble.text}</p>
        {bubble.action && (
          <button
            type="button"
            onClick={onAction}
            className="mt-2.5 inline-flex h-8 cursor-pointer items-center border-2 border-foreground bg-primary px-3 text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            {bubble.action.label}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss Tamari's message"
          title="Dismiss"
          className="absolute top-1 right-1 flex h-8 w-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        {/* A two-pixel-block trail down to Tamari. */}
        <span aria-hidden="true" className="absolute -bottom-3 right-6 block h-2.5 w-2.5 border-2 border-foreground bg-card lg:right-8" />
        <span aria-hidden="true" className="absolute -bottom-5 right-4 block h-1.5 w-1.5 bg-foreground lg:right-6" />
      </div>
    </div>
  );
}
