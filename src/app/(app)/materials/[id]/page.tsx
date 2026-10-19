import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MaterialActions } from "@/components/materials/material-actions";
import { MaterialContent } from "@/components/materials/material-content";
import { MaterialOriginal } from "@/components/materials/material-original";
import { MaterialOverview } from "@/components/materials/material-overview";
import { MaterialStatusBadge } from "@/components/materials/material-status";
import { MaterialTabs } from "@/components/materials/material-tabs";
import { StudyTools } from "@/components/materials/study-tools";
import { TrackOpen } from "@/components/materials/track-open";
import { formatRelativeDate } from "@/components/materials/material-card";
import { buttonClasses } from "@/components/ui/button";
import { formatBytes, SOURCE_LABEL } from "@/lib/materials/constants";
import { getMaterial, getMaterialAnalysis, getMaterialChunks, listSubjects } from "@/lib/materials/queries";
import { listQuizzes } from "@/lib/quizzes/queries";
import { listReviewers } from "@/lib/reviewers/queries";
import { routes } from "@/lib/routes";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const material = await getMaterial(id);
  return { title: material?.title ?? "Material" };
}

const TABS = ["overview", "content", "original"] as const;
type Tab = (typeof TABS)[number];

export default async function MaterialPage({ params, searchParams }: PageProps<"/materials/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const material = await getMaterial(id);
  if (!material) notFound();

  const requested = typeof query.tab === "string" ? query.tab : "overview";
  const tab: Tab = (TABS as readonly string[]).includes(requested) ? (requested as Tab) : "overview";
  const [chunks, analysis, subjects, reviewers, quizzes] = await Promise.all([
    tab === "content" ? getMaterialChunks(material.id) : Promise.resolve([]),
    tab === "overview" ? getMaterialAnalysis(material.id) : Promise.resolve(null),
    listSubjects(),
    tab === "overview" ? listReviewers({ materialId: material.id }) : Promise.resolve([]),
    tab === "overview" ? listQuizzes({ materialId: material.id }) : Promise.resolve([]),
  ]);

  const hrefFor = (next: string) => `${routes.materials}/${material.id}${next === "overview" ? "" : `?tab=${next}`}`;
  const meta = [
    SOURCE_LABEL[material.source],
    material.page_count ? `${material.page_count} page${material.page_count === 1 ? "" : "s"}` : null,
    material.word_count ? `${material.word_count.toLocaleString()} words` : null,
    material.source !== "text" ? formatBytes(material.file_size) : null,
    `added ${formatRelativeDate(material.created_at)}`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <TrackOpen materialId={material.id} />

      <div className="flex flex-col gap-3">
        <Link
          href={material.subject ? `${routes.materials}?subject=${material.subject.id}` : routes.materials}
          className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {material.subject ? material.subject.name : "All materials"}
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{material.title}</h1>
          <p className="text-sm text-muted-foreground">
            {material.subject ? material.subject.name : "No subject"}
            {material.folder ? ` · ${material.folder.name}` : ""}
            {" · "}
            {meta.join(" · ")}
          </p>
          <MaterialStatusBadge
            materialId={material.id}
            status={material.status}
            detail={material.status_detail}
            showDetail
          />
          {material.archived_at && (
            <p className="text-sm text-muted-foreground">
              Archived {formatRelativeDate(material.archived_at)}. Unarchive it to see it in your lists again.
            </p>
          )}
        </div>
        <MaterialActions
          materialId={material.id}
          title={material.title}
          subjectId={material.subject_id}
          folderId={material.folder_id}
          archived={Boolean(material.archived_at)}
          subjects={subjects}
        />
      </div>

      <MaterialTabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "content", label: "Content" },
          { id: "original", label: material.source === "text" ? "Original notes" : "Original file" },
        ]}
        active={tab}
        hrefFor={hrefFor}
      />

      {tab === "overview" ? (
        <div className="flex flex-col gap-4">
          <StudyTools materialId={material.id} status={material.status} reviewers={reviewers} quizzes={quizzes} />
          <MaterialOverview
            materialId={material.id}
            status={material.status}
            statusDetail={material.status_detail}
            analysis={analysis}
          />
        </div>
      ) : tab === "content" ? (
        <div className="max-w-3xl">
          <MaterialContent chunks={chunks} />
        </div>
      ) : (
        <MaterialOriginal material={material} />
      )}
    </div>
  );
}
