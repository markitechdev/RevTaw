import { Layers, ListChecks, NotebookPen } from "lucide-react";
import Link from "next/link";

import { NewDeckButton } from "@/components/flashcards/new-deck-dialog";
import { NewQuizButton } from "@/components/quizzes/new-quiz-dialog";
import { GenerateReviewerButton } from "@/components/reviewers/generate-reviewer-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeckListItem } from "@/lib/flashcards/queries";
import type { QuizListItem } from "@/lib/quizzes/queries";
import { REVIEWER_KIND_BY_ID } from "@/lib/reviewers/kinds";
import type { ReviewerListItem } from "@/lib/reviewers/queries";
import { routes } from "@/lib/routes";
import type { MaterialStatus } from "@/lib/supabase/database.types";

/** What the student can build from this material, plus what already exists. */
export function StudyTools({
  materialId,
  status,
  reviewers,
  quizzes,
  decks,
}: {
  materialId: string;
  status: MaterialStatus;
  reviewers: ReviewerListItem[];
  quizzes: QuizListItem[];
  decks: DeckListItem[];
}) {
  const ready = status === "ready";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Study tools</CardTitle>
        <CardDescription>
          {ready
            ? "Turn this material into something you can study from. Everything stays grounded in the text above."
            : "Available once processing finishes."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <GenerateReviewerButton materialId={materialId} disabled={!ready} size="sm" />
          <NewQuizButton materialId={materialId} disabled={!ready} size="sm" variant="secondary" />
          <NewDeckButton materialId={materialId} disabled={!ready} size="sm" variant="secondary" />
        </div>

        {reviewers.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reviewers from this material</h3>
            <ul className="flex flex-col divide-y divide-border">
              {reviewers.map((reviewer) => (
                <li key={reviewer.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <Link href={`${routes.notes}/${reviewer.id}`} className="truncate text-sm font-medium hover:underline">
                      {reviewer.title}
                    </Link>
                  </div>
                  <Badge tone={reviewer.status === "failed" ? "danger" : reviewer.status === "ready" ? "neutral" : "primary"}>
                    {reviewer.status === "ready" ? REVIEWER_KIND_BY_ID[reviewer.kind].name : reviewer.status === "failed" ? "Failed" : "Generating…"}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {decks.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Flashcard decks from this material</h3>
            <ul className="flex flex-col divide-y divide-border">
              {decks.map((deck) => (
                <li key={deck.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <Link href={`${routes.flashcards}/${deck.id}`} className="truncate text-sm font-medium hover:underline">
                      {deck.title}
                    </Link>
                  </div>
                  <Badge tone={deck.status === "failed" ? "danger" : deck.status === "ready" ? (deck.dueCount > 0 ? "primary" : "neutral") : "primary"}>
                    {deck.status === "ready" ? (deck.dueCount > 0 ? `${deck.dueCount} due` : `${deck.card_count} cards`) : deck.status === "failed" ? "Failed" : "Generating…"}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {quizzes.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quizzes from this material</h3>
            <ul className="flex flex-col divide-y divide-border">
              {quizzes.map((quiz) => (
                <li key={quiz.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <Link href={`${routes.quiz}/${quiz.id}`} className="truncate text-sm font-medium hover:underline">
                      {quiz.title}
                    </Link>
                  </div>
                  <Badge tone={quiz.status === "failed" ? "danger" : quiz.status === "ready" ? "neutral" : "primary"}>
                    {quiz.status === "ready"
                      ? quiz.bestPercent !== null
                        ? `Best ${quiz.bestPercent}%`
                        : `${quiz.question_count} questions`
                      : quiz.status === "failed"
                        ? "Failed"
                        : "Generating…"}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
