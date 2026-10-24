import "server-only";

import { fileTypeFromBuffer } from "file-type";

import type { MaterialSource } from "@/lib/supabase/database.types";

export type DetectedType = {
  source: MaterialSource;
  mime: string;
};

const BINARY_SOURCES: Record<string, DetectedType> = {
  "application/pdf": { source: "pdf", mime: "application/pdf" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    source: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  "application/x-cfb": { source: "doc", mime: "application/msword" },
  "application/msword": { source: "doc", mime: "application/msword" },
  "image/png": { source: "image", mime: "image/png" },
  "image/jpeg": { source: "image", mime: "image/jpeg" },
  "image/webp": { source: "image", mime: "image/webp" },
  "image/gif": { source: "image", mime: "image/gif" },
};

/**
 * Determines what a file really is from its bytes ("magic numbers"), never
 * from the extension or the browser-supplied MIME type. Returns null when the
 * content is not one of the supported kinds.
 *
 * A DOCX is a ZIP archive; `file-type` recognizes it by inspecting the
 * central directory, so a renamed .zip is rejected rather than treated as a
 * document.
 */
export async function detectMaterialType(bytes: Uint8Array): Promise<DetectedType | null> {
  const detected = await fileTypeFromBuffer(bytes);
  if (detected) {
    return BINARY_SOURCES[detected.mime] ?? null;
  }

  if (looksLikeText(bytes)) {
    return { source: "text", mime: "text/plain" };
  }
  return null;
}

/** Heuristic UTF-8 text check: decodes strictly and rejects control-heavy content. */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, 64_000));
  } catch {
    return false;
  }
  let control = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0) return false;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) control += 1;
  }
  return control / Math.max(text.length, 1) < 0.01;
}
