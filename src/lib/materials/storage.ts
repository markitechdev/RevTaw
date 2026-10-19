import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { STORAGE_BUCKET } from "@/lib/materials/constants";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** Keeps only safe characters so the object key is predictable and short. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const limited = cleaned.length > 120 ? cleaned.slice(-120) : cleaned;
  return limited || "file";
}

/** Object key inside the private bucket: <user>/<material>/<filename>. */
export function materialObjectPath(userId: string, materialId: string, filename: string): string {
  return `${userId}/${materialId}/${safeFilename(filename)}`;
}

export async function downloadMaterialBytes(client: Client, path: string): Promise<Uint8Array> {
  const { data, error } = await client.storage.from(STORAGE_BUCKET).download(path);
  if (error || !data) {
    throw new Error(`storage download failed: ${error?.message ?? "no data"}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

export async function uploadMaterialBytes(
  client: Client,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await client.storage.from(STORAGE_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(`storage upload failed: ${error.message}`);
  }
}

export async function removeMaterialObjects(client: Client, paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return;
  const { error } = await client.storage.from(STORAGE_BUCKET).remove(unique);
  if (error) {
    throw new Error(`storage remove failed: ${error.message}`);
  }
}

/** Returns a short-lived upload URL the browser can PUT the file to directly. */
export async function createUploadTarget(
  client: Client,
  path: string,
): Promise<{ signedUrl: string; token: string }> {
  const { data, error } = await client.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`signed upload url failed: ${error?.message ?? "no data"}`);
  }
  return { signedUrl: data.signedUrl, token: data.token };
}
