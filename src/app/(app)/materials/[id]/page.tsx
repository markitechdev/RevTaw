import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MaterialContent } from "@/components/materials/material-content";
import { MaterialOriginal } from "@/components/materials/material-original";
import { MaterialStatusBadge } from "@/components/materials/material-status";
import { MaterialTabs } from "@/components/materials/material-tabs";
import { TrackOpen } from "@/components/materials/track-open";
import { formatRelativeDate } from "@/components/materials/material-card";
import { buttonClasses } from "@/components/ui/button";
import { formatBytes, SOURCE_LABEL } from "@/lib/materials/constants";
import { getMaterial, getMaterialChunks } from "@/lib/materials/queries";
import { routes } from "@/lib/routes";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const material = await getMaterial(id);
  return { title: material?.title ?? "Material" };
}

const TABS = ["content", "original"] as const;
type Tab = (typeof TABS)[number];

export default async function MaterialPage({ params, searchParams }: PageProps<"/materials/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const material = await getMaterial(id);
  if (!material) notFound();

  const requested = typeof query.tab === "string" ? query.tab : "content";
  const tab: Tab = (TABS as readonly string[]).includes(requested) ? (requested as Tab) : "content";
  const chunks = tab === "content" ? await getMaterialChunks(material.id) : [];

  const hrefFor = (next: string) => `${routes.materials}/${material.id}${next === "content" ? "" : `?tab=${next}`}`;
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
        </div>
      </div>

      <MaterialTabs
        tabs={[
          { id: "content", label: "Content" },
          { id: "original", label: material.source === "text" ? "Original notes" : "Original file" },
        ]}
        active={tab}
        hrefFor={hrefFor}
      />

      {tab === "content" ? (
        <div className="max-w-3xl">
          <MaterialContent chunks={chunks} />
        </div>
      ) : (
        <MaterialOriginal material={material} />
      )}
    </div>
  );
}
