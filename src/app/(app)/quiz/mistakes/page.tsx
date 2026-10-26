import { NotebookPen, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ExportMenu } from "@/components/export/export-menu";
import { MistakeItem } from "@/components/quizzes/mistake-item";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { TINT } from "@/components/ui/tint";
import { LIST_PAGE_SIZE, parsePage, withPage } from "@/lib/pagination";
import { listMistakesPage, listRepeatedMistakeConcepts } from "@/lib/quizzes/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Mistake notebook",
};

export default async function MistakesPage({ searchParams }: PageProps<"/quiz/mistakes">) {
  const params = await searchParams;
  const showResolved = params.view === "learned";
  const [listed, repeated] = await Promise.all([listMistakesPage({ resolved: showResolved }, parsePage(params.page), LIST_PAGE_SIZE), showResolved ? Promise.resolve([]) : listRepeatedMistakeConcepts()]);
  const pageHref = (next: number) => withPage(`${routes.quiz}/mistakes`, { view: showResolved ? "learned" : null }, next);
  if (listed.beyond) redirect(pageHref(listed.pageCount));
  const mistakes = listed.items;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: routes.quiz, label: "Quizzes" }}
        title="Mistake notebook"
        description="Wrong answers from your quizzes and study sessions land here with the correct answer and the reason. Classify what went wrong, then retest it with Error Review: a right answer on a later day than the miss marks it learned. You can also mark it learned yourself once you can answer it cold."
        actions={
          <>
            {!showResolved && mistakes.length > 0 && (
              <Link href={`${routes.study}?method=error_review`} className={buttonClasses({ size: "sm" })}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retest these
              </Link>
            )}
            {mistakes.length > 0 && <ExportMenu target={{ kind: "mistakes", query: { view: showResolved ? "learned" : "open" } }} />}
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
          </>
        }
      />

      {!showResolved && repeated.length > 0 && (
        <div className={`rounded-xl border p-4 text-sm ${TINT.warning}`}>
          <p className="font-medium">Repeated trouble spots</p>
          <p className="mt-1 text-muted-foreground">
            {repeated.map((entry) => `${entry.name} (${entry.count})`).join(" · ")}. Re-read their sections in the material before the next quiz.
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
        <>
          <ul className="flex flex-col gap-3">
            {mistakes.map((mistake) => (
              <MistakeItem key={mistake.id} mistake={mistake} />
            ))}
          </ul>
          <Pagination page={listed.page} pageCount={listed.pageCount} pageSize={listed.pageSize} total={listed.total} noun={showResolved ? "learned mistakes" : "mistakes"} hrefFor={pageHref} />
        </>
      )}
    </div>
  );
}
