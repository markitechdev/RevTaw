"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  /** Server-known preference (e.g. from the user's profile), if any. */
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme ?? "system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  // On mount, prefer what the user stored in this browser; fall back to the
  // server-provided preference. The inline script in <head> already applied
  // the right class before first paint, so this never causes a flash.
  useEffect(() => {
    const stored = initialTheme ?? readStoredTheme();
    setThemeState(stored);
  }, [initialTheme]);

  useEffect(() => {
    const resolve = () => {
      const r = theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
      setResolvedTheme(r);
      applyTheme(r);
    };
    resolve();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", resolve);
    return () => mq.removeEventListener("change", resolve);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage unavailable (private mode) — in-memory only */
    }
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
 * page never flashes the wrong colours. Rendered in the root layout <head>.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var t=localStorage.getItem(k);var d=t==="dark"||((t===null||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
