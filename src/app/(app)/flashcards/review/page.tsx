import type { Metadata } from "next";

import { AssistantLauncher } from "@/components/assistant/assistant-provider";
import { FlashcardReview } from "@/components/flashcards/flashcard-review";
import { getReviewQueue } from "@/lib/flashcards/queries";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Review due flashcards",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Spaced repetition across every deck: everything that is due right now. */
export default async function ReviewAllPage({ searchParams }: PageProps<"/flashcards/review">) {
  const params = await searchParams;
  const task = typeof params.task === "string" && UUID.test(params.task) ? params.task : null;
  const queue = await getReviewQueue({ mode: "due", limit: 200 });
  return (
    <>
      <AssistantLauncher mode="desktop" />
      <FlashcardReview queue={queue} deckId={null} mode="due" backHref={task ? routes.planner : routes.flashcards} backLabel={task ? "Planner" : "Flashcards"} title="Reviewing due flashcards" taskId={task} />
    </>
  );
}
