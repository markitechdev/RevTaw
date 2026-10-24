"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/**
 * The landing page's looping motion (the typing headline, its caret, the floating doodles) can be paused
 * (WCAG 2.2.2). The choice lives on <html data-landing-motion>, so CSS pauses the doodles and the caret,
 * and the headline listens for it; it is remembered in this browser.
 */
const STORAGE_KEY = "revtaw-landing-motion";
const EVENT = "revtaw:landing-motion";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function isPaused(): boolean {
  return document.documentElement.dataset.landingMotion === "paused";
}

/** Whether the landing page's motion is paused (false on the server). */
export function useLandingMotionPaused(): boolean {
  return useSyncExternalStore(subscribe, isPaused, () => false);
}

function setPaused(paused: boolean, remember = true) {
  document.documentElement.dataset.landingMotion = paused ? "paused" : "playing";
  if (remember) {
    try {
      window.localStorage.setItem(STORAGE_KEY, paused ? "paused" : "playing");
    } catch {
      // Private windows and blocked storage: the choice lasts for this page only.
    }
  }
  window.dispatchEvent(new Event(EVENT));
}

/** "Pause animation" / "Play animation", shown only where the motion runs (not with the device's reduced motion). */
export function MotionToggle({ className }: { className?: string }) {
  const paused = useLandingMotionPaused();

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }
    if (saved === "paused") setPaused(true, false);
    // Leaving the landing page: the app has its own motion setting.
    return () => {
      delete document.documentElement.dataset.landingMotion;
    };
  }, []);

  const Icon = paused ? Play : Pause;
  return (
    <button
      type="button"
      onClick={() => setPaused(!paused)}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline motion-reduce:hidden pointer-coarse:min-h-11",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {paused ? "Play animation" : "Pause animation"}
    </button>
  );
}
