"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useOptimistic, useState, useTransition, type ReactNode } from "react";

import { saveAppearanceAction, type SavePreferencesResult } from "@/lib/preferences/actions";
import type { AppearancePreferences } from "@/lib/preferences/options";
import { APPEARANCE_COOKIE, APPEARANCE_COOKIE_MAX_AGE, appearanceAttributes, applyAppearance, encodeAppearance } from "@/lib/theme/appearance";

type AppearanceContextValue = {
  /** What is on screen now: a live preview, a save in flight, or the saved value. */
  appearance: AppearancePreferences;
  /** The value saved in the account. */
  saved: AppearancePreferences;
  /** Shows a value without saving it (dragging the custom color picker). Pass null to stop previewing. */
  preview: (next: AppearancePreferences | null) => void;
  /** Applies a value immediately and saves it to the account. */
  save: (next: AppearancePreferences) => Promise<SavePreferencesResult>;
  saving: boolean;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

/**
 * The signed-in app's theme color and motion frame (UI phase §10–§11). The
 * account value arrives from the server, so the frame renders in the right
 * color and motion on the first paint; <html> and the appearance cookie are
 * kept in step for dialogs outside the frame and for the next first paint on
 * this device. Reduce motion is applied only while the frame is mounted.
 */
export function AppearanceRoot({ appearance, children }: { appearance: AppearancePreferences; children: ReactNode }) {
  const [previewing, setPreviewing] = useState<AppearancePreferences | null>(null);
  const [optimistic, setOptimistic] = useOptimistic(appearance);
  const [saving, startTransition] = useTransition();
  const current = previewing ?? optimistic;

  useEffect(() => {
    applyAppearance(document.documentElement, current);
  }, [current]);

  // Reduce motion is the app's: on leaving it (for the landing page, say) the page moves again.
  useEffect(
    () => () => {
      delete document.documentElement.dataset.motion;
    },
    [],
  );

  useEffect(() => {
    // A new device (or a cleared cookie): mirror the account value for the next first paint.
    const encoded = encodeAppearance(appearance);
    if (readCookie(APPEARANCE_COOKIE) === encoded) return;
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${APPEARANCE_COOKIE}=${encoded}; path=/; max-age=${APPEARANCE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
  }, [appearance]);

  const save = useCallback(
    (next: AppearancePreferences) =>
      new Promise<SavePreferencesResult>((resolve) => {
        startTransition(async () => {
          setOptimistic(next);
          setPreviewing(null);
          resolve(await saveAppearanceAction(next));
        });
      }),
    [setOptimistic],
  );

  const value = useMemo<AppearanceContextValue>(
    () => ({ appearance: current, saved: appearance, preview: setPreviewing, save, saving }),
    [current, appearance, save, saving],
  );

  return (
    <AppearanceContext.Provider value={value}>
      <div className="contents" {...appearanceAttributes(current)}>
        {children}
      </div>
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("useAppearance must be used inside <AppearanceRoot>");
  return context;
}
