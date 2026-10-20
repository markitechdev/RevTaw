"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

const IDS = { sidebar: "global-search", page: "page-search" } as const;

/**
 * Global search box (§33): submits to /search. "/" focuses it from anywhere
 * that is not already a text field. The sidebar box and the search page's
 * own box can share a page, so each has its own id and landmark name, and
 * the page's box takes the shortcut when both are present.
 */
export function SearchBox({ initialQuery = "", autoFocus = false, className, placement = "sidebar" }: { initialQuery?: string; autoFocus?: boolean; className?: string; placement?: "sidebar" | "page" }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = IDS[placement];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (placement === "sidebar" && document.getElementById(IDS.page)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [placement]);

  return (
    <form
      role="search"
      aria-label={placement === "sidebar" ? "Quick search" : "Search"}
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const value = query.trim();
        if (value) router.push(`${routes.search}?q=${encodeURIComponent(value)}`);
      }}
    >
      <label htmlFor={id} className="sr-only">
        Search documents, notes, topics, questions, flashcards and conversations
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        ref={inputRef}
        id={id}
        type="search"
        name="q"
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search everything…  /"
        autoComplete="off"
        maxLength={120}
        className={cn("h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none", placement === "page" && "h-10")}
      />
    </form>
  );
}
