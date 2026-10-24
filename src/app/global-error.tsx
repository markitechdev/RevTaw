"use client";

import { useEffect } from "react";

import { THEME_STORAGE_KEY } from "@/components/theme/theme-provider";
import { BRAND } from "@/lib/brand";

import "./globals.css";

/**
 * The last resort, when the root layout itself fails: it replaces the whole document, so it brings the global
 * styles and applies the saved light or dark theme itself. Kept plain (no app components) so it cannot fail
 * the same way.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      const dark = saved === "dark" || ((saved === null || saved === "system") && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    } catch {
      // Storage blocked: the light theme stays.
    }
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center px-4 text-center">
        <title>{`Something went wrong · ${BRAND.name}`}</title>
        <main className="flex max-w-md flex-col items-center gap-4">
          <p className="text-sm font-semibold text-primary">{BRAND.name}</p>
          <h1 className="font-display text-title font-bold leading-tight tracking-display text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">Nothing you did caused this. Try again in a moment.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={retry} className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
              Try again
            </button>
            {/* A full page load, not a client navigation: the app around this page has failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the router lives in the layout that failed */}
            <a href="/" className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted">
              Go to the front page
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
