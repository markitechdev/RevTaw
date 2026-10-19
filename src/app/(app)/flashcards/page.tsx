import { Layers } from "lucide-react";
import type { Metadata } from "next";

import { SectionPlaceholder } from "@/components/app/section-placeholder";

export const metadata: Metadata = {
  title: "Flashcards",
};

export default function FlashcardsPage() {
  return (
    <SectionPlaceholder
      title="Flashcards"
      description="Cards generated from reviewers, rated after each review and scheduled with spaced repetition."
      icon={Layers}
      phase="Phase 4"
      emptyTitle="No decks yet"
      emptyDescription="Flashcards are generated from a reviewer, so they follow materials and reviewers in the build order."
    />
  );
}
