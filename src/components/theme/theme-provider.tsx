"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "revtaw-theme";

type ThemeContextValue = {
  /** The user's chosen preference. */
  theme: Theme;
  /** What is actually applied right now, after resolving "system". */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/* ------------------------------------------------------------------ */
/* A tiny external store over localStorage so React can subscribe to  */
/* it with useSyncExternalStore (hydration-safe, no setState in effect) */
/* ------------------------------------------------------------------ */
const listeners = new Set<() => void>();

function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark" || v === "system";
}

function getStoredTheme(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(v) ? v : "system";
  } catch {
    return "system";
  }
}

function subscribeTheme(cb: () => void) {
  listeners.add(cb);
  // Changes made in another tab arrive as storage events.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeSystem(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const getSystemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Server snapshot is always "system" / light; the inline <head> script has
  // already applied the correct class before hydration, so there is no flash.
  const theme = useSyncExternalStore(subscribeTheme, getStoredTheme, () => "system" as Theme);
  const systemDark = useSyncExternalStore(subscribeSystem, getSystemDark, () => false);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  // Keep the DOM in sync. This effect only touches the DOM, never state.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage unavailable (private mode) — nothing to persist */
    }
    listeners.forEach((l) => l());
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/**
 * Inline script that applies the stored theme before React hydrates, so the
 * page never flashes the wrong colors. Rendered in the root layout <head>.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var t=localStorage.getItem(k);var d=t==="dark"||((t===null||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
