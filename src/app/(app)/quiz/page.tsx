import { ListChecks, NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert } from "@/components/forms/form-alert";
import { formatRelativeDate } from "@/components/materials/material-card";
import { NewQuizButton } from "@/components/quizzes/new-quiz-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { listMaterials } from "@/lib/materials/queries";
import { GRID_PAGE_SIZE, parsePage, withPage } from "@/lib/pagination";
import { countOpenMistakes, listQuizzesPage } from "@/lib/quizzes/queries";
import { QUESTION_TYPE_BY_ID, QUIZ_MODE_LABEL } from "@/lib/quizzes/types";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Quiz",
};

export default async function QuizPage({ searchParams }: PageProps<"/quiz">) {
  const params = await searchParams;
  const [listed, materials, openMistakes] = await Promise.all([listQuizzesPage(parsePage(params.page), GRID_PAGE_SIZE), listMaterials(), countOpenMistakes()]);
  const pageHref = (next: number) => withPage(routes.quiz, {}, next);
  if (listed.beyond) redirect(pageHref(listed.pageCount));
  const quizzes = listed.items;
  const readyMaterials = materials
    .filter((material) => material.status === "ready")
    .map((material) => ({ id: material.id, title: material.title, subject: material.subject?.name ?? null }));
  const notice = params.notice === "deleted" ? "The quiz was deleted." : null;

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert tone="success">{notice}</Alert>}
      <PageHeader
        title="Quiz"
        description="Quizzes written from your materials. Every answer is scored and every mistake is filed by concept."
        actions={
          <>
            <Link href={`${routes.quiz}/mistakes`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <NotebookPen className="h-4 w-4" aria-hidden="true" />
              Mistake notebook{openMistakes > 0 ? ` (${openMistakes})` : ""}
            </Link>
            <NewQuizButton materials={readyMaterials} size="sm" defaultOpen={params.create === "1"}>
              New quiz
            </NewQuizButton>
          </>
        }
      />

      {quizzes.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={readyMaterials.length === 0 ? "Quizzes need a processed material first" : "No quizzes yet"}
          description={
            readyMaterials.length === 0
              ? "Upload a PDF, DOCX, image or notes. Once it is processed you can generate multiple choice, identification, true/false, fill-in, short answer, essay, scenario, case-based and problem-solving questions from it."
              : "Pick a material and choose the question types, count, difficulty and timer. Practice mode gives feedback as you go; exam mode scores at the end."
          }
          action={
            readyMaterials.length === 0 ? (
              <Link href={routes.materials} className={buttonClasses({ size: "sm" })}>
                Go to Materials
              </Link>
            ) : (
              <NewQuizButton materials={readyMaterials} size="sm">
                Create your first quiz
              </NewQuizButton>
            )
          }
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {quizzes.map((quiz) => (
              <li key={quiz.id}>
                <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-primary/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={quiz.config.mode === "exam" ? "warning" : "primary"}>{QUIZ_MODE_LABEL[quiz.config.mode]}</Badge>
                    <Badge tone="neutral">{quiz.question_count} questions</Badge>
                    {quiz.status !== "ready" && (
                      <Badge tone={quiz.status === "failed" ? "danger" : "neutral"}>{quiz.status === "failed" ? "Failed" : "Generating…"}</Badge>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`${routes.quiz}/${quiz.id}`} className="line-clamp-2 font-medium text-foreground hover:underline">
                      {quiz.title}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {quiz.material?.title ?? "Material removed"}
                      {quiz.material?.subject ? ` · ${quiz.material.subject.name}` : ""}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {quiz.config.questionTypes.map((type) => QUESTION_TYPE_BY_ID[type].name).join(", ")}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {quiz.attemptCount === 0
                        ? "Not attempted yet"
                        : `${quiz.attemptCount} attempt${quiz.attemptCount === 1 ? "" : "s"} · best ${quiz.bestPercent}%`}
                    </span>
                    <span>{formatRelativeDate(quiz.updated_at)}</span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination page={listed.page} pageCount={listed.pageCount} pageSize={listed.pageSize} total={listed.total} noun="quizzes" hrefFor={pageHref} />
        </>
      )}
    </div>
  );
}
