import { ArrowLeft, NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MistakeItem } from "@/components/quizzes/mistake-item";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listMistakes } from "@/lib/quizzes/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Mistake notebook",
};

export default async function MistakesPage({ searchParams }: PageProps<"/quiz/mistakes">) {
  const params = await searchParams;
  const showResolved = params.view === "learned";
  const mistakes = await listMistakes({ resolved: showResolved });

  const concepts = new Map<string, { name: string; count: number }>();
  for (const mistake of mistakes) {
    if (!mistake.concept) continue;
    const entry = concepts.get(mistake.concept.id) ?? { name: mistake.concept.name, count: 0 };
    entry.count += 1;
    concepts.set(mistake.concept.id, entry);
  }
  const repeated = [...concepts.entries()].filter(([, entry]) => entry.count >= 2).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="flex flex-col gap-6">
      <Link href={routes.quiz} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Quizzes
      </Link>
      <PageHeader
        title="Mistake notebook"
        description="Every incorrect quiz answer lands here automatically with the correct answer and the reason. Classify what went wrong, then mark it learned once you can answer it cold."
        actions={
          <nav className="flex rounded-lg border border-border p-0.5 text-sm" aria-label="Notebook view">
            <Link
              href={`${routes.quiz}/mistakes`}
              className={cn("rounded-md px-3 py-1.5", !showResolved ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              aria-current={!showResolved ? "page" : undefined}
            >
              To review
            </Link>
            <Link
              href={`${routes.quiz}/mistakes?view=learned`}
              className={cn("rounded-md px-3 py-1.5", showResolved ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              aria-current={showResolved ? "page" : undefined}
            >
              Learned
            </Link>
          </nav>
        }
      />

      {!showResolved && repeated.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning-soft/40 p-4 text-sm">
          <p className="font-medium">Repeated trouble spots</p>
          <p className="mt-1 text-muted-foreground">
            {repeated.map(([, entry]) => `${entry.name} (${entry.count})`).join(" · ")}. Re-read their sections in the material before the next quiz.
          </p>
        </div>
      )}

      {mistakes.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={showResolved ? "Nothing marked as learned yet" : "No mistakes to review"}
          description={
            showResolved
              ? "When you mark a mistake as learned it moves here, so you can see how far you have come."
              : "Take a quiz and anything you get wrong is saved here with the correct answer and explanation."
          }
          action={
            <Link href={routes.quiz} className={buttonClasses({ size: "sm" })}>
              Go to quizzes
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {mistakes.map((mistake) => (
            <MistakeItem key={mistake.id} mistake={mistake} />
          ))}
        </ul>
      )}
    </div>
  );
}
