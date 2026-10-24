import { Download, FileType } from "lucide-react";

import { PdfViewer } from "@/components/materials/pdf-viewer";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBytes } from "@/lib/materials/constants";
import type { MaterialDetail } from "@/lib/materials/queries";

/** Shows the uploaded file itself: PDFs and images inline, documents as a download. */
export function MaterialOriginal({ material }: { material: MaterialDetail }) {
  const fileUrl = `/api/materials/${material.id}/file`;

  if (!material.storage_path) {
    return (
      <EmptyState
        icon={FileType}
        title="No file attached"
        description="This material has no uploaded file."
      />
    );
  }

  if (material.source === "pdf") {
    return (
      <div className="flex flex-col gap-3">
        <PdfViewer url={fileUrl} title={material.title} />
        <DownloadLink href={fileUrl} label="Download PDF" size={material.file_size} />
      </div>
    );
  }

  if (material.source === "image") {
    return (
      <div className="flex flex-col gap-3">
        {/* The image is served privately from our own origin, so next/image optimization is skipped on purpose. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fileUrl}
          alt={material.title}
          className="max-h-[75vh] w-auto max-w-full rounded-xl border border-border bg-card object-contain"
        />
        <DownloadLink href={fileUrl} label="Download image" size={material.file_size} />
      </div>
    );
  }

  if (material.source === "text") {
    return (
      <div className="flex flex-col gap-3">
        <iframe
          src={fileUrl}
          title={`${material.title} (text)`}
          sandbox=""
          className="h-[60vh] w-full rounded-xl border border-border bg-card"
        />
        <DownloadLink href={fileUrl} label="Download text file" size={material.file_size} />
      </div>
    );
  }

  return (
    <EmptyState
      icon={FileType}
      title="Word documents open in your own apps"
      description="The extracted text is in the Content tab. Download the original to open it in Word or Google Docs."
      action={<DownloadLink href={fileUrl} label="Download document" size={material.file_size} />}
    />
  );
}

function DownloadLink({ href, label, size }: { href: string; label: string; size: number | null }) {
  return (
    <a href={href} download className={buttonClasses({ variant: "secondary", size: "sm", className: "self-start" })}>
      <Download className="h-4 w-4" aria-hidden="true" />
      {label}
      {size ? <span className="text-muted-foreground">({formatBytes(size)})</span> : null}
    </a>
  );
}
