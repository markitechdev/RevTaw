"use client";

import { MessageCircle } from "lucide-react";
import type { Ref } from "react";

import { cn } from "@/lib/utils";

/**
 * The way into the chat on every page except Home, where Tamari itself opens
 * it: a round chat button in the bottom-right corner, above the tab bar on
 * phones, fully on screen. Tamari's picture lives on Home only. `desktop`
 * keeps it off phones where the corner belongs to the page (flashcard
 * ratings); the provider leaves it out while the chat is open.
 */
export function ChatLauncher({ mode, onOpen, ref }: { mode: "visible" | "desktop"; onOpen: () => void; ref?: Ref<HTMLButtonElement> }) {
  return (
    <div data-chat-button="" className={cn("fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 lg:right-6 lg:bottom-6", mode === "desktop" ? "hidden lg:block" : "block")}>
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-label="Ask Tamari"
        title="Ask Tamari"
        className="flex size-12 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pop transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 lg:size-14"
      >
        <MessageCircle className="size-5 lg:size-6" aria-hidden="true" />
      </button>
    </div>
  );
}
