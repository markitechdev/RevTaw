import type { Metadata } from "next";

import { FlashcardReview } from "@/components/flashcards/flashcard-review";
import { getReviewQueue } from "@/lib/flashcards/queries";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Review due flashcards",
};

/** Spaced repetition across every deck: everything that is due right now. */
export default async function ReviewAllPage() {
  const queue = await getReviewQueue({ mode: "due", limit: 200 });
  return <FlashcardReview queue={queue} deckId={null} mode="due" backHref={routes.flashcards} backLabel="Flashcards" />;
}
