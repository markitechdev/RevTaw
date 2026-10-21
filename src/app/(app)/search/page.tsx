import { FileText, Layers, Lightbulb, ListChecks, MessageSquare, NotebookPen, Search, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SearchBox } from "@/components/app/search-box";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { routes } from "@/lib/routes";
import { globalSearch, normalizeQuery, type SearchGroup } from "@/lib/search/queries";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Search",
};

const ICONS: Record<SearchGroup, LucideIcon> = { materials: FileText, reviewers: NotebookPen, topics: Lightbulb, questions: ListChecks, flashcards: Layers, conversations: MessageSquare };

/** Global search (§33): "Binary Tree" shows every related resource, grouped. */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const params = await searchParams;
  const query = normalizeQuery(typeof params.q === "string" ? params.q : "");
  const results = query ? await globalSearch(query) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Search" description="Across your documents, notes and reviewers, topics, quiz questions, flashcards and AI conversations. Use quotes for an exact phrase, OR between alternatives, and a minus sign to leave a word out." />
      <SearchBox initialQuery={query} autoFocus className="max-w-2xl" />

      {!results ? (
        <EmptyState icon={Search} title="Type something to search" description="Try a concept from your material — every resource that mentions it shows up here." />
      ) : results.total === 0 ? (
        <EmptyState icon={Search} title={`Nothing found for “${results.query}”`} description="Check the spelling, try a shorter word, or search for the concept the way your material names it." />
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {results.total} result{results.total === 1 ? "" : "s"} for “{results.query}” in {results.groups.length} area{results.groups.length === 1 ? "" : "s"}.
          </p>
          {results.groups.map((group) => {
            const Icon = ICONS[group.group];
            return (
              <section key={group.group} aria-labelledby={`search-${group.group}`} className="flex flex-col gap-2">
                <h2 id={`search-${group.group}`} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {group.label} · {group.hits.length}
                </h2>
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {group.hits.map((hit) => (
                    <li key={`${group.group}-${hit.id}`}>
                      <Link href={hit.href} className="flex h-full flex-col gap-1 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-muted/40">
                        <span className="font-medium">{hit.title}</span>
                        {hit.snippet && <span className="text-sm text-muted-foreground">{hit.snippet}</span>}
                        {hit.context && <span className="text-xs text-muted-foreground">{hit.context}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
