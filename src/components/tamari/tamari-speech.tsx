"use client";

import { X } from "lucide-react";

import type { TamariBubble } from "@/lib/tamari/lines";

/**
 * Tamari's speech bubble at the edge of the screen (companion doc §11, §16): a
 * pixel-style card just above the peeking Tamari with one short line, an
 * optional next step and a way to dismiss it. It never covers Tamari and is
 * announced to screen readers by the provider's live line, not by this card.
 */
export function TamariSpeech({ bubble, busy = false, onAction, onDismiss }: { bubble: TamariBubble; busy?: boolean; onAction: () => void; onDismiss: () => void }) {
  return (
    <div
      className="tamari-enter mb-3 w-[min(17rem,calc(100vw-1.5rem))]"
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
            disabled={busy}
            className="mt-2.5 inline-flex h-8 cursor-pointer items-center border-2 border-foreground bg-primary px-3 text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-wait disabled:opacity-70"
          >
            {busy ? "Sandali…" : bubble.action.label}
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
        {/* Two pixel blocks trailing down to Tamari's head. */}
        <span aria-hidden="true" className="absolute -bottom-3 right-8 block h-1.5 w-1.5 bg-foreground lg:right-10" />
        <span aria-hidden="true" className="absolute -bottom-[1.125rem] right-6 block h-1 w-1 bg-foreground lg:right-8" />
      </div>
    </div>
  );
}
