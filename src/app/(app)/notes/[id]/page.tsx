import { ArrowLeft, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AssistantPage } from "@/components/assistant/assistant-provider";
import { formatRelativeDate } from "@/components/materials/material-card";
import { ExportMenu } from "@/components/export/export-menu";
import { ReviewerActions } from "@/components/reviewers/reviewer-actions";
import { ReviewerSectionView } from "@/components/reviewers/reviewer-section";
import { TrackReviewerOpen } from "@/components/reviewers/track-open";
import { HighlightToolbar } from "@/components/tutor/highlight-toolbar";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { GeneratingState } from "@/components/ui/generating-state";
import { PAGE_TITLE } from "@/components/ui/typography";
import { REVIEWER_KIND_BY_ID } from "@/lib/reviewers/kinds";
import { getReviewer } from "@/lib/reviewers/queries";
import { routes } from "@/lib/routes";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const reviewer = await getReviewer(id);
  return { title: reviewer?.title ?? "Reviewer" };
}

export default async function ReviewerPage({ params }: PageProps<"/notes/[id]">) {
  const { id } = await params;
  const reviewer = await getReviewer(id);
  if (!reviewer) notFound();

  const kind = REVIEWER_KIND_BY_ID[reviewer.kind];

  return (
    <div className="flex flex-col gap-6">
      <AssistantPage context={{ kind: "reviewer", id: reviewer.id }} label={reviewer.material ? `${reviewer.material.title} → ${reviewer.title}` : reviewer.title} materialId={reviewer.material?.id ?? null} />
      <TrackReviewerOpen reviewerId={reviewer.id} />

      <div className="flex flex-col gap-3">
        <Link href={routes.notes} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Notes
        </Link>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{kind.name}</Badge>
            {reviewer.status === "generating" && <Badge tone="neutral">Generating…</Badge>}
          </div>
          <h1 className={PAGE_TITLE}>{reviewer.title}</h1>
          <p className="text-sm text-muted-foreground">
            {reviewer.material ? (
              <>
                From{" "}
                <Link href={`${routes.materials}/${reviewer.material.id}`} className="font-medium text-foreground wrap-anywhere hover:underline">
                  {reviewer.material.title}
                </Link>
                {reviewer.material.subject ? ` · ${reviewer.material.subject.name}` : ""}
              </>
            ) : (
              "Source material removed"
            )}
            {" · "}created {formatRelativeDate(reviewer.created_at)}
            {reviewer.provider ? ` · ${reviewer.provider}` : ""}
          </p>
          {reviewer.status_detail && reviewer.status !== "failed" && (
            <p className="text-sm text-muted-foreground">{reviewer.status_detail}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {reviewer.status === "ready" && reviewer.sections.length > 0 && <ExportMenu target={{ kind: "reviewer", id: reviewer.id }} />}
          <ReviewerActions reviewerId={reviewer.id} title={reviewer.title} status={reviewer.status} />
        </div>
      </div>

      {reviewer.status === "failed" ? (
        <ErrorState
          title="This reviewer could not be generated"
          description={reviewer.status_detail ?? "Something went wrong while generating."}
        />
      ) : reviewer.status === "generating" ? (
        <GeneratingState title="Writing your notes…" description="Sections appear here as soon as RevTaw finishes. This page checks by itself." />
      ) : reviewer.sections.length === 0 ? (
        <ErrorState title="These notes have no sections" description="Generate them again from the material." />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]">
          <nav aria-label="Sections" className="hidden lg:block">
            <ol className="sticky top-6 flex flex-col gap-1 text-sm">
              {reviewer.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#section-${section.position + 1}`}
                    className="block truncate rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex min-w-0 max-w-3xl flex-col gap-4">
            {reviewer.material ? (
              <HighlightToolbar materialId={reviewer.material.id}>
                <div className="flex flex-col gap-4">
                  {reviewer.sections.map((section) => (
                    <ReviewerSectionView key={section.id} reviewerId={reviewer.id} section={section} />
                  ))}
                </div>
              </HighlightToolbar>
            ) : (
              reviewer.sections.map((section) => <ReviewerSectionView key={section.id} reviewerId={reviewer.id} section={section} />)
            )}
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Generated only from your material. Facts outside it are not added.{reviewer.material ? " Select any text to ask RevTaw about it." : ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
