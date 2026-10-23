import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MaterialMastery } from "@/components/adaptive/material-mastery";
import { AssistantPage } from "@/components/assistant/assistant-provider";
import { Alert } from "@/components/forms/form-alert";
import { MaterialActions } from "@/components/materials/material-actions";
import { MaterialContent } from "@/components/materials/material-content";
import { HighlightToolbar } from "@/components/tutor/highlight-toolbar";
import { MaterialOriginal } from "@/components/materials/material-original";
import { MaterialOverview } from "@/components/materials/material-overview";
import { MaterialStatusBadge } from "@/components/materials/material-status";
import { MaterialTabs } from "@/components/materials/material-tabs";
import { StudyTools } from "@/components/materials/study-tools";
import { TrackOpen } from "@/components/materials/track-open";
import { formatRelativeDate, placementOf } from "@/components/materials/material-card";
import { buttonClasses } from "@/components/ui/button";
import { listMastery } from "@/lib/adaptive/engine";
import { listReviewTasks } from "@/lib/planner/queries";
import { formatBytes, SOURCE_LABEL } from "@/lib/materials/constants";
import { getMaterial, getMaterialAnalysis, getMaterialChunks, listSubjects } from "@/lib/materials/queries";
import { dayLabel, KEPT_ITEMS, purgeCountdown, purgeDueAt } from "@/lib/materials/retention";
import { listDecks } from "@/lib/flashcards/queries";
import { listQuizzes } from "@/lib/quizzes/queries";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { listReviewers } from "@/lib/reviewers/queries";
import { routes } from "@/lib/routes";
import { countMnemonicsFor } from "@/lib/study/flows/memory";

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
  const [material, { profile }] = await Promise.all([getMaterial(id), getCurrentUserWithProfile()]);
  if (!material) notFound();
  const timeZone = profile?.timezone ?? undefined;

  const deleted = material.status === "deleted" || Boolean(material.purged_at);
  const archived = Boolean(material.archived_at) && !deleted;

  const requested = typeof query.tab === "string" ? query.tab : "overview";
  // Once the file is gone there is no text or original to show: only what was made from it.
  const tab: Tab = !deleted && (TABS as readonly string[]).includes(requested) ? (requested as Tab) : "overview";
  const [chunks, analysis, subjects, reviewers, quizzes, decks, mastery, reviewTasks, memoryAids] = await Promise.all([
    tab === "content" ? getMaterialChunks(material.id) : Promise.resolve([]),
    tab === "overview" && !deleted ? getMaterialAnalysis(material.id) : Promise.resolve(null),
    listSubjects(),
    tab === "overview" ? listReviewers({ materialId: material.id }) : Promise.resolve([]),
    tab === "overview" ? listQuizzes({ materialId: material.id }) : Promise.resolve([]),
    tab === "overview" ? listDecks({ materialId: material.id }) : Promise.resolve([]),
    tab === "overview" ? listMastery({ materialId: material.id }) : Promise.resolve([]),
    tab === "overview" && !deleted ? listReviewTasks(material.id) : Promise.resolve([]),
    tab === "overview" ? countMnemonicsFor(material.id) : Promise.resolve(0),
  ]);

  const hrefFor = (next: string) => `${routes.materials}/${material.id}${next === "overview" ? "" : `?tab=${next}`}`;
  const meta = deleted
    ? [SOURCE_LABEL[material.source], `added ${formatRelativeDate(material.created_at)}`]
    : [
        SOURCE_LABEL[material.source],
        material.page_count ? `${material.page_count} page${material.page_count === 1 ? "" : "s"}` : null,
        material.word_count ? `${material.word_count.toLocaleString("en-US")} words` : null,
        material.source !== "text" ? formatBytes(material.file_size) : null,
        `added ${formatRelativeDate(material.created_at)}`,
      ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      {!deleted && <TrackOpen materialId={material.id} />}
      {material.status === "ready" && <AssistantPage context={{ kind: "material", id: material.id }} label={material.subject ? `${material.subject.name} → ${material.title}` : material.title} materialId={material.id} />}

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
          {!deleted && (
            <MaterialStatusBadge
              materialId={material.id}
              status={material.status}
              detail={material.status_detail}
              showDetail
            />
          )}
        </div>
        {archived && material.archived_at && (
          <Alert tone="warning">
            In the Archive. Its file, extracted text and analysis are deleted permanently{" "}
            <strong>{purgeCountdown(material.archived_at)}</strong> ({dayLabel(purgeDueAt(material.archived_at), timeZone)}) unless you restore it.{" "}
            {KEPT_ITEMS} made from it stay either way.
          </Alert>
        )}
        {deleted && (
          <Alert tone="info">
            The file was deleted permanently{material.purged_at ? ` on ${dayLabel(material.purged_at, timeZone)}` : ""}, with its extracted text and analysis.{" "}
            {KEPT_ITEMS} made from it are kept here — rename it or move it to keep them organized.
          </Alert>
        )}
        <MaterialActions
          materialId={material.id}
          title={material.title}
          subjectId={material.subject_id}
          folderId={material.folder_id}
          filedUnder={placementOf(material)}
          state={deleted ? "deleted" : archived ? "archived" : "active"}
          subjects={subjects}
        />
      </div>

      {!deleted && (
        <MaterialTabs
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "content", label: "Content" },
            { id: "original", label: material.source === "text" ? "Original notes" : "Original file" },
          ]}
          active={tab}
          hrefFor={hrefFor}
        />
      )}

      {tab === "overview" ? (
        <div className="flex flex-col gap-4">
          <StudyTools materialId={material.id} status={material.status} reviewers={reviewers} quizzes={quizzes} decks={decks} memoryAids={memoryAids} scheduledReviews={reviewTasks.filter((task) => task.status === "pending").length} />
          <MaterialMastery materialId={material.id} rows={mastery} studyable={!deleted} />
          {!deleted && (
            <MaterialOverview
              materialId={material.id}
              status={material.status}
              statusDetail={material.status_detail}
              analysis={analysis}
            />
          )}
        </div>
      ) : tab === "content" ? (
        <div className="max-w-3xl">
          <HighlightToolbar materialId={material.id}>
            <p className="mb-4 text-xs text-muted-foreground">Select any sentence to ask RevTaw about it — explain, simplify, give an example, quiz me, ask why.</p>
            <MaterialContent chunks={chunks} />
          </HighlightToolbar>
        </div>
      ) : (
        <MaterialOriginal material={material} />
      )}
    </div>
  );
}
