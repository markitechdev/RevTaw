import type { MaterialSource, MaterialStatus } from "@/lib/supabase/database.types";

/** Hard limits shared by the browser, server actions and the storage bucket. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // keep in sync with the bucket limit
export const MAX_TEXT_CHARS = 200_000;
export const MIN_TEXT_CHARS = 20;
export const MATERIAL_TITLE_MAX = 160;
export const STORAGE_BUCKET = "materials";

export type AcceptedType = {
  mime: string;
  extensions: string[];
  source: MaterialSource;
  label: string;
};

/**
 * Upload allow-list. The browser uses it for the file picker and a first
 * check; the server re-validates the declared type and then inspects the
 * actual bytes (see `src/lib/materials/detect.ts`).
 */
export const ACCEPTED_TYPES: ReadonlyArray<AcceptedType> = [
  { mime: "application/pdf", extensions: ["pdf"], source: "pdf", label: "PDF" },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
    source: "docx",
    label: "Word (DOCX)",
  },
  { mime: "application/msword", extensions: ["doc"], source: "doc", label: "Word (DOC)" },
  { mime: "image/png", extensions: ["png"], source: "image", label: "PNG image" },
  { mime: "image/jpeg", extensions: ["jpg", "jpeg"], source: "image", label: "JPEG image" },
  { mime: "image/webp", extensions: ["webp"], source: "image", label: "WebP image" },
  { mime: "image/gif", extensions: ["gif"], source: "image", label: "GIF image" },
  { mime: "text/plain", extensions: ["txt"], source: "text", label: "Text file" },
  { mime: "text/markdown", extensions: ["md", "markdown"], source: "text", label: "Markdown" },
];

export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.flatMap((type) => [
  type.mime,
  ...type.extensions.map((extension) => `.${extension}`),
]).join(",");

export function acceptedTypeFor(filename: string, mime: string): AcceptedType | null {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  const normalizedMime = mime.toLowerCase().split(";")[0].trim();
  const byExtension = ACCEPTED_TYPES.find((type) => type.extensions.includes(extension));
  if (!byExtension) return null;
  // Browsers sometimes send a generic or empty MIME; the extension decides the
  // intended type and the server verifies the real bytes afterwards.
  if (normalizedMime && normalizedMime !== "application/octet-stream" && normalizedMime !== byExtension.mime) {
    const byMime = ACCEPTED_TYPES.find((type) => type.mime === normalizedMime);
    if (!byMime || byMime.source !== byExtension.source) return null;
  }
  return byExtension;
}

export const STATUS_LABEL: Record<MaterialStatus, string> = {
  uploading: "Uploading",
  extracting: "Reading your material",
  analyzing: "Analyzing concepts",
  ready: "Ready",
  failed: "Failed",
};

export const IN_FLIGHT_STATUSES: ReadonlySet<MaterialStatus> = new Set(["uploading", "extracting", "analyzing"]);

export const SOURCE_LABEL: Record<MaterialSource, string> = {
  pdf: "PDF",
  docx: "Word document",
  doc: "Word document",
  image: "Image",
  text: "Notes",
};

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
