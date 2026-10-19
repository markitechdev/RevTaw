"use client";

import { getPublicEnv } from "@/lib/env";
import type { MaterialStatus } from "@/lib/supabase/database.types";

export type UploadProgress = { loaded: number; total: number; percent: number };

/**
 * PUTs the file straight to the signed storage URL with XMLHttpRequest so the
 * dialog can show real upload progress (fetch has no upload events).
 */
export function uploadFileToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = getPublicEnv();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("apikey", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("cache-control", "max-age=3600");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress({ loaded: file.size, total: file.size, percent: 100 });
        resolve();
      } else {
        reject(new Error(uploadErrorMessage(xhr.status)));
      }
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));

    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

function uploadErrorMessage(status: number): string {
  if (status === 413) return "The file is larger than the 25 MB limit.";
  if (status === 401 || status === 403) return "The upload link expired. Please try again.";
  if (status === 415) return "That file type is not accepted by storage.";
  return "The upload failed. Please try again.";
}

export type ProcessResponse = { status: MaterialStatus; detail: string | null } | { error: string };

/** Kicks off (or retries) server-side processing for a material. */
export async function requestProcessing(materialId: string, force = false): Promise<ProcessResponse> {
  const response = await fetch(`/api/materials/${materialId}/process${force ? "?force=1" : ""}`, {
    method: "POST",
    headers: { accept: "application/json" },
  });
  const body = (await response.json().catch(() => ({ error: "Unexpected response." }))) as ProcessResponse;
  if (!response.ok && !("error" in body)) {
    return { error: "Processing could not be started." };
  }
  return body;
}

export type StatusResponse = { status: MaterialStatus; detail: string | null; updatedAt: string };

export async function fetchStatus(materialId: string): Promise<StatusResponse | null> {
  const response = await fetch(`/api/materials/${materialId}/status`, { headers: { accept: "application/json" } });
  if (!response.ok) return null;
  return (await response.json()) as StatusResponse;
}
