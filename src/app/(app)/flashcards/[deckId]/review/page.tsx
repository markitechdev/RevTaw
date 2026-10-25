import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssistantPage } from "@/components/assistant/assistant-provider";
import { FlashcardReview } from "@/components/flashcards/flashcard-review";
import { getDeck, getResumableReview, getReviewQueue } from "@/lib/flashcards/queries";
import { shuffled } from "@/lib/random";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Review flashcards",
};

export default async function DeckReviewPage({ params, searchParams }: PageProps<"/flashcards/[deckId]/review">) {
  const { deckId } = await params;
  const query = await searchParams;
  const deck = await getDeck(deckId);
  if (!deck) notFound();
  const mode = query.mode === "all" || query.mode === "favorites" ? query.mode : "due";
  const shuffle = query.shuffle === "1";
  // "Continue" on an unfinished review of this deck picks up that session instead of opening a new one.
  const [queue, resumeSessionId] = await Promise.all([getReviewQueue({ deckId: deck.id, mode, limit: 200 }), getResumableReview(query.session, { deckId: deck.id, mode })]);

  return (
    <>
      {/* Phones keep the rating buttons clear: the floating button is desktop-only here. */}
      <AssistantPage context={{ kind: "deck", id: deck.id }} label={`Flashcards → ${deck.title}`} materialId={deck.material_id} launcher="desktop" />
      <FlashcardReview
      key={`${mode}-${shuffle}`}
      resumeSessionId={resumeSessionId}
      // Shuffled on the server, so the first render and hydration agree.
      queue={shuffle ? shuffled(queue) : queue}
      deckId={deck.id}
      mode={mode}
      backHref={`${routes.flashcards}/${deck.id}`}
      backLabel={deck.title}
      title={`${mode === "favorites" ? "Reviewing favorites in" : mode === "all" ? "Studying" : "Reviewing"} ${deck.title}`}
      />
    </>
  );
}
