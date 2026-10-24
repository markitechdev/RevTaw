"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PAGE_SEARCH_ID } from "@/components/app/command-menu-launcher";
import { SearchInput } from "@/components/ui/search-input";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The full search page's box (§33): submits to /search. "/" focuses it while
 * the page is open (everywhere else "/" opens the command menu).
 */
export function SearchBox({ initialQuery = "", autoFocus = false, className }: { initialQuery?: string; autoFocus?: boolean; className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      aria-label="Search"
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const value = query.trim();
        if (value) router.push(`${routes.search}?q=${encodeURIComponent(value)}`);
      }}
    >
      <label htmlFor={PAGE_SEARCH_ID} className="sr-only">
        Search documents, notes, topics, questions, flashcards and conversations
      </label>
      <SearchInput
        ref={inputRef}
        id={PAGE_SEARCH_ID}
        name="q"
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search everything…  /"
        autoComplete="off"
        maxLength={120}
      />
    </form>
  );
}
