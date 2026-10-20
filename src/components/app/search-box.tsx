"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Global search box (§33): submits to /search. "/" focuses it from anywhere
 * that is not already a text field.
 */
export function SearchBox({ initialQuery = "", autoFocus = false, className, compact = false }: { initialQuery?: string; autoFocus?: boolean; className?: string; compact?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (compact) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [compact]);

  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const value = query.trim();
        if (value) router.push(`${routes.search}?q=${encodeURIComponent(value)}`);
      }}
    >
      <label htmlFor={compact ? "global-search-compact" : "global-search"} className="sr-only">
        Search documents, notes, topics, questions, flashcards and conversations
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        ref={inputRef}
        id={compact ? "global-search-compact" : "global-search"}
        type="search"
        name="q"
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={compact ? "Search" : "Search everything…  /"}
        autoComplete="off"
        maxLength={120}
        className={cn("h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none", compact && "h-10")}
      />
    </form>
  );
}
