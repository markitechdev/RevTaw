import { NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert } from "@/components/forms/form-alert";
import { formatRelativeDate } from "@/components/materials/material-card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { GRID_PAGE_SIZE, parsePage, withPage } from "@/lib/pagination";
import { REVIEWER_KIND_BY_ID } from "@/lib/reviewers/kinds";
import { listReviewersPage } from "@/lib/reviewers/queries";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Notes",
};

export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const params = await searchParams;
  const listed = await listReviewersPage(parsePage(params.page), GRID_PAGE_SIZE);
  const pageHref = (next: number) => withPage(routes.notes, {}, next);
  if (listed.beyond) redirect(pageHref(listed.pageCount));
  const reviewers = listed.items;
  const notice = params.notice === "deleted" ? "The reviewer was deleted." : null;

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert tone="success">{notice}</Alert>}
      <PageHeader
        title="Notes"
        description="Reviewers generated from your materials. Every section is editable, and any section can be regenerated without touching the rest."
        actions={
          <Link href={routes.notesNew} className={buttonClasses({ size: "sm" })}>
            <NotebookPen className="h-4 w-4" aria-hidden="true" />
            Create a reviewer
          </Link>
        }
      />

      {reviewers.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No reviewers yet"
          description="Turn a material into a complete reviewer, concise summary, bullet notes, Q&A, Cornell notes, cheat sheet and more."
          action={
            <Link href={routes.notesNew} className={buttonClasses({ size: "sm" })}>
              Create a reviewer
            </Link>
          }
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {reviewers.map((reviewer) => (
              <li key={reviewer.id}>
                <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <Badge tone="primary">{REVIEWER_KIND_BY_ID[reviewer.kind].name}</Badge>
                    {reviewer.status !== "ready" && (
                      <Badge tone={reviewer.status === "failed" ? "danger" : "neutral"}>
                        {reviewer.status === "failed" ? "Failed" : "Generating…"}
                      </Badge>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`${routes.notes}/${reviewer.id}`} className="line-clamp-2 font-medium text-foreground hover:underline">
                      {reviewer.title}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {reviewer.material?.title ?? "Material removed"}
                      {reviewer.material?.subject ? ` · ${reviewer.material.subject.name}` : ""}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">Updated {formatRelativeDate(reviewer.updated_at)}</p>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination page={listed.page} pageCount={listed.pageCount} pageSize={listed.pageSize} total={listed.total} noun="reviewers" hrefFor={pageHref} />
        </>
      )}
    </div>
  );
}
