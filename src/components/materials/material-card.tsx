import { Clock, FileImage, FileText, FileType, NotebookPen } from "lucide-react";
import Link from "next/link";

import { PurgeMaterialButton, RestoreMaterialButton } from "@/components/materials/archive-controls";
import { MaterialStatusBadge } from "@/components/materials/material-status";
import { Card } from "@/components/ui/card";
import { formatBytes, SOURCE_LABEL } from "@/lib/materials/constants";
import type { MaterialListItem } from "@/lib/materials/queries";
import { dayLabel, purgeCountdown, purgeDueAt } from "@/lib/materials/retention";
import { routes } from "@/lib/routes";
import type { MaterialSource } from "@/lib/supabase/database.types";

const SOURCE_ICON: Record<MaterialSource, typeof FileText> = {
  pdf: FileText,
  docx: FileType,
  doc: FileType,
  image: FileImage,
  text: NotebookPen,
};

/**
 * "3 min ago" style dates. Client components that render this during
 * hydration mark the element with `suppressHydrationWarning`, since a minute
 * can pass between the server render and the client one; the locale is
 * pinned so server and browser agree on the format.
 */
export function formatRelativeDate(value: string): string {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "General Biology · Cells" (or null when unfiled). */
export function placementOf(material: { subject: { name: string } | null; folder: { name: string } | null }): string | null {
  if (!material.subject) return null;
  return material.folder ? `${material.subject.name} · ${material.folder.name}` : material.subject.name;
}

/** A material in a list; in the Archive it shows when it goes and how to bring it back. */
export function MaterialCard({ material, timeZone }: { material: MaterialListItem; timeZone?: string }) {
  const Icon = SOURCE_ICON[material.source];
  const meta = [
    SOURCE_LABEL[material.source],
    material.page_count ? `${material.page_count} page${material.page_count === 1 ? "" : "s"}` : null,
    material.word_count ? `${material.word_count.toLocaleString("en-US")} words` : null,
    material.source !== "text" ? formatBytes(material.file_size) : null,
  ].filter(Boolean);

  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`${routes.materials}/${material.id}`}
            className="line-clamp-2 font-medium text-foreground hover:underline"
          >
            {material.title}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {material.subject ? material.subject.name : "No subject"}
            {material.folder ? ` · ${material.folder.name}` : ""}
          </p>
        </div>
      </div>

      <MaterialStatusBadge
        materialId={material.id}
        status={material.status}
        detail={material.status_detail}
        showDetail={material.status === "failed"}
      />

      <p className="text-xs text-muted-foreground">
        {meta.join(" · ")} · {formatRelativeDate(material.updated_at)}
      </p>

      {material.archived_at && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
            <span>
              Deletes permanently <span className="font-semibold text-foreground">{purgeCountdown(material.archived_at)}</span> ({dayLabel(purgeDueAt(material.archived_at), timeZone)})
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <RestoreMaterialButton materialId={material.id} />
            <PurgeMaterialButton materialId={material.id} title={material.title} placement={placementOf(material)} />
          </div>
        </div>
      )}
    </Card>
  );
}
