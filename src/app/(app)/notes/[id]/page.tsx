import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssistantPage } from "@/components/assistant/assistant-provider";
import { MadeFrom } from "@/components/content/made-from";
import { ExportMenu } from "@/components/export/export-menu";
import { ReviewerActions } from "@/components/reviewers/reviewer-actions";
import { ReviewerSectionView } from "@/components/reviewers/reviewer-section";
import { TrackReviewerOpen } from "@/components/reviewers/track-open";
import { HighlightToolbar } from "@/components/tutor/highlight-toolbar";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { GeneratingState } from "@/components/ui/generating-state";
import { DetailHeader } from "@/components/ui/page-header";
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

      <DetailHeader
        back={{ href: routes.notes, label: "Notes" }}
        badges={
          <>
            <Badge tone="primary">{kind.name}</Badge>
            {reviewer.status === "generating" && <Badge tone="neutral">Generating…</Badge>}
          </>
        }
        title={reviewer.title}
        meta={<MadeFrom material={reviewer.material} createdAt={reviewer.created_at} provider={reviewer.provider} />}
        status={reviewer.status_detail && reviewer.status !== "failed" && <p className="text-sm text-muted-foreground">{reviewer.status_detail}</p>}
        actions={
          <>
            {reviewer.status === "ready" && reviewer.sections.length > 0 && <ExportMenu target={{ kind: "reviewer", id: reviewer.id }} />}
            <ReviewerActions reviewerId={reviewer.id} title={reviewer.title} status={reviewer.status} />
          </>
        }
      />

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
