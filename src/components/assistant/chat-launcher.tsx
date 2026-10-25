"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useState, type Ref } from "react";

import { cn } from "@/lib/utils";

/** Scroll this far (px) in one direction before the button moves, so a shaky thumb does not make it flicker. */
const SCROLL_STEP = 6;

/**
 * On phones and tablets the round button sits over the page, so whatever scrolls under it (a row's buttons)
 * is covered for a moment. It steps aside while the page scrolls down and comes back on the way up, near
 * the top and at the end of the page, where the page leaves room for it. Wide screens keep it in place.
 */
function useStepsAside(): boolean {
  const [aside, setAside] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 64rem)");
    let last = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 8;
      if (wide.matches || y < 80 || atEnd) setAside(false);
      else if (y > last + SCROLL_STEP) setAside(true);
      else if (y < last - SCROLL_STEP) setAside(false);
      else return;
      last = y;
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);
  return aside;
}

/**
 * The way into the chat on every page except Home, where Tamari itself opens
 * it: a round chat button in the bottom-right corner, above the tab bar on
 * phones, fully on screen. Tamari's picture lives on Home only. `desktop`
 * keeps it off phones where the corner belongs to the page (flashcard
 * ratings); the provider leaves it out while the chat is open. On phones and
 * tablets it steps aside while the page scrolls down; it comes back when it
 * gets the keyboard focus, so it is never focused out of sight.
 */
export function ChatLauncher({ mode, onOpen, ref }: { mode: "visible" | "desktop"; onOpen: () => void; ref?: Ref<HTMLButtonElement> }) {
  const aside = useStepsAside();
  return (
    <div
      data-chat-button=""
      data-aside={aside || undefined}
      className={cn(
        "fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 transition-[translate,opacity] duration-200 ease-out lg:right-6 lg:bottom-6",
        aside && "pointer-events-none translate-y-[calc(100%+5rem)] opacity-0 focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100",
        mode === "desktop" ? "hidden lg:block" : "block",
      )}
    >
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
