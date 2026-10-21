import { ArrowLeft, Play, Shuffle, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AssistantPage } from "@/components/assistant/assistant-provider";
import { BoxBar, CardList } from "@/components/flashcards/card-list";
import { ExportMenu } from "@/components/export/export-menu";
import { DeckActions } from "@/components/flashcards/deck-actions";
import { formatRelativeDate } from "@/components/materials/material-card";
import { formatDue } from "@/components/study/session-summary";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { getDeck } from "@/lib/flashcards/queries";
import { routes } from "@/lib/routes";

export async function generateMetadata({ params }: { params: Promise<{ deckId: string }> }): Promise<Metadata> {
  const { deckId } = await params;
  const deck = await getDeck(deckId);
  return { title: deck?.title ?? "Deck" };
}

export default async function DeckPage({ params }: PageProps<"/flashcards/[deckId]">) {
  const { deckId } = await params;
  const deck = await getDeck(deckId);
  if (!deck) notFound();
  const favorites = deck.cards.filter((card) => card.favorite && !card.suspended).length;
  const base = `${routes.flashcards}/${deck.id}/review`;

  return (
    <div className="flex flex-col gap-6">
      <AssistantPage context={{ kind: "deck", id: deck.id }} label={`Flashcards → ${deck.title}`} materialId={deck.material_id} />
      <div className="flex flex-col gap-3">
        <Link href={routes.flashcards} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Flashcards
        </Link>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{deck.card_count} cards</Badge>
            {deck.status === "ready" && <Badge tone={deck.dueCount > 0 ? "primary" : "success"}>{deck.dueCount > 0 ? `${deck.dueCount} due now` : "Nothing due"}</Badge>}
            {deck.status === "generating" && <Badge tone="neutral">Generating…</Badge>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{deck.title}</h1>
          <p className="text-sm text-muted-foreground">
            {deck.material ? (
              <>
                From{" "}
                <Link href={`${routes.materials}/${deck.material.id}`} className="font-medium text-foreground hover:underline">
                  {deck.material.title}
                </Link>
                {deck.material.subject ? ` · ${deck.material.subject.name}` : ""}
              </>
            ) : (
              "Source material removed"
            )}
            {" · "}created {formatRelativeDate(deck.created_at)}
            {deck.provider ? ` · ${deck.provider}` : ""}
          </p>
          {deck.status_detail && deck.status !== "failed" && <p className="text-sm text-muted-foreground">{deck.status_detail}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {deck.status === "ready" && deck.cards.length > 0 && <ExportMenu target={{ kind: "deck", id: deck.id }} />}
          <DeckActions deckId={deck.id} title={deck.title} status={deck.status} />
        </div>
      </div>

      {deck.status === "failed" ? (
        <ErrorState title="This deck could not be generated" description={deck.status_detail ?? "Something went wrong while writing the cards."} />
      ) : deck.cards.length === 0 ? (
        <ErrorState title="Still generating" description="Cards appear here once RevTaw finishes writing them. Refresh in a moment." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Review</CardTitle>
                <CardDescription>
                  {deck.dueCount > 0 ? `${deck.dueCount} card${deck.dueCount === 1 ? " is" : "s are"} due. ` : "Nothing is due right now. "}
                  Next review: {formatDue(deck.nextDueAt)}.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Link href={`${base}?mode=due`} className={buttonClasses({ size: "sm", variant: deck.dueCount > 0 ? "primary" : "secondary" })} aria-disabled={deck.dueCount === 0}>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Review due ({deck.dueCount})
                </Link>
                <Link href={`${base}?mode=all`} className={buttonClasses({ size: "sm", variant: deck.dueCount > 0 ? "secondary" : "primary" })}>
                  Study all cards
                </Link>
                <Link href={`${base}?mode=all&shuffle=1`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
                  <Shuffle className="h-4 w-4" aria-hidden="true" />
                  Shuffle all
                </Link>
                <Link href={`${base}?mode=favorites`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
                  <Star className="h-4 w-4" aria-hidden="true" />
                  Favorites ({favorites})
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Leitner boxes</CardTitle>
                <CardDescription>Cards move up when you know them and drop back when you don&apos;t.</CardDescription>
              </CardHeader>
              <CardContent>
                <BoxBar boxes={deck.boxes} />
              </CardContent>
            </Card>
          </div>

          <section aria-labelledby="cards-heading" className="flex flex-col gap-3">
            <h2 id="cards-heading" className="text-lg font-semibold">
              Cards
            </h2>
            <CardList cards={deck.cards} renderedAt={deck.fetchedAt} />
          </section>
        </>
      )}
    </div>
  );
}
