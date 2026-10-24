import { Layers, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BoxBar } from "@/components/flashcards/card-list";
import { NewDeckButton } from "@/components/flashcards/new-deck-dialog";
import { Alert } from "@/components/forms/form-alert";
import { formatRelativeDate } from "@/components/materials/material-card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { countDueCards, listDecksPage } from "@/lib/flashcards/queries";
import { listMaterials } from "@/lib/materials/queries";
import { GRID_PAGE_SIZE, parsePage, withPage } from "@/lib/pagination";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Flashcards",
};

export default async function FlashcardsPage({ searchParams }: PageProps<"/flashcards">) {
  const params = await searchParams;
  const [listed, materials, due] = await Promise.all([listDecksPage(parsePage(params.page), GRID_PAGE_SIZE), listMaterials(), countDueCards()]);
  const pageHref = (next: number) => withPage(routes.flashcards, {}, next);
  if (listed.beyond) redirect(pageHref(listed.pageCount));
  const decks = listed.items;
  const readyMaterials = materials
    .filter((material) => material.status === "ready")
    .map((material) => ({ id: material.id, title: material.title, subject: material.subject?.name ?? null }));
  const notice = params.notice === "deleted" ? "The deck was deleted." : null;

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert tone="success">{notice}</Alert>}
      <PageHeader
        title="Flashcards"
        description="Decks generated from your materials. Rate each card and spaced repetition decides when you see it again."
        actions={
          <>
            <Link href={`${routes.flashcards}/review`} className={buttonClasses({ variant: due > 0 ? "primary" : "secondary", size: "sm" })}>
              <Play className="h-4 w-4" aria-hidden="true" />
              Review due{due > 0 ? ` (${due})` : ""}
            </Link>
            <NewDeckButton materials={readyMaterials} size="sm" variant={due > 0 ? "secondary" : "primary"} defaultOpen={params.create === "1"}>
              New deck
            </NewDeckButton>
          </>
        }
      />

      {decks.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={readyMaterials.length === 0 ? "Flashcards need a processed material first" : "No decks yet"}
          description={
            readyMaterials.length === 0
              ? "Upload a material; once it is processed you can turn its definitions and key facts into cards."
              : "Generate a deck from a material. Cards start in box 1 and climb to Mastered as you rate them."
          }
          action={
            readyMaterials.length === 0 ? (
              <Link href={routes.materials} className={buttonClasses({ size: "sm" })}>
                Go to Materials
              </Link>
            ) : (
              <NewDeckButton materials={readyMaterials} size="sm">
                Create your first deck
              </NewDeckButton>
            )
          }
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {decks.map((deck) => (
              <li key={deck.id}>
                <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-primary/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{deck.card_count} cards</Badge>
                    {deck.status === "ready" && deck.dueCount > 0 && <Badge tone="primary">{deck.dueCount} due</Badge>}
                    {deck.status !== "ready" && (
                      <Badge tone={deck.status === "failed" ? "danger" : "neutral"}>{deck.status === "failed" ? "Failed" : "Generating…"}</Badge>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`${routes.flashcards}/${deck.id}`} className="line-clamp-2 font-medium text-foreground hover:underline">
                      {deck.title}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {deck.material?.title ?? "Material removed"}
                      {deck.material?.subject ? ` · ${deck.material.subject.name}` : ""}
                    </p>
                  </div>
                  {deck.status === "ready" && <BoxBar boxes={deck.boxes} compact />}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Updated {formatRelativeDate(deck.updated_at)}</span>
                    {deck.status === "ready" && (
                      <Link href={`${routes.flashcards}/${deck.id}/review?mode=${deck.dueCount > 0 ? "due" : "all"}`} className="font-medium text-primary hover:underline">
                        {deck.dueCount > 0 ? "Review due" : "Study all"}
                      </Link>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination page={listed.page} pageCount={listed.pageCount} pageSize={listed.pageSize} total={listed.total} noun="decks" hrefFor={pageHref} />
        </>
      )}
    </div>
  );
}
