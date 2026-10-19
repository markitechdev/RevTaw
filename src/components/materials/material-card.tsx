import { FileImage, FileText, FileType, NotebookPen } from "lucide-react";

import { MaterialStatusBadge } from "@/components/materials/material-status";
import { Card } from "@/components/ui/card";
import { formatBytes, SOURCE_LABEL } from "@/lib/materials/constants";
import type { MaterialListItem } from "@/lib/materials/queries";
import type { MaterialSource } from "@/lib/supabase/database.types";

const SOURCE_ICON: Record<MaterialSource, typeof FileText> = {
  pdf: FileText,
  docx: FileType,
  doc: FileType,
  image: FileImage,
  text: NotebookPen,
};

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
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function MaterialCard({ material }: { material: MaterialListItem }) {
  const Icon = SOURCE_ICON[material.source];
  const meta = [
    SOURCE_LABEL[material.source],
    material.page_count ? `${material.page_count} page${material.page_count === 1 ? "" : "s"}` : null,
    material.word_count ? `${material.word_count.toLocaleString()} words` : null,
    material.source !== "text" ? formatBytes(material.file_size) : null,
  ].filter(Boolean);

  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium text-foreground">{material.title}</p>
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
    </Card>
  );
}
