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

/** Storage removes at most this many objects per request. */
const REMOVE_BATCH = 500;

export async function removeMaterialObjects(client: Client, paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  for (let index = 0; index < unique.length; index += REMOVE_BATCH) {
    const { error } = await client.storage.from(STORAGE_BUCKET).remove(unique.slice(index, index + REMOVE_BATCH));
    if (error) {
      throw new Error(`storage remove failed: ${error.message}`);
    }
  }
}

const LIST_PAGE = 1000;
const LIST_CONCURRENCY = 8;

/**
 * Every object under a student's folder, whatever rows point at it. Storage
 * lists one folder level at a time (subfolders come back without an id), a
 * page at a time; RevTaw's keys are <user>/<material>/<file>, and a few more
 * levels are followed in case.
 */
export async function listUserObjectPaths(client: Client, userId: string): Promise<string[]> {
  const files: string[] = [];
  let folders = [userId];
  for (let depth = 0; depth < 4 && folders.length > 0; depth += 1) {
    const subfolders: string[] = [];
    for (let index = 0; index < folders.length; index += LIST_CONCURRENCY) {
      await Promise.all(
        folders.slice(index, index + LIST_CONCURRENCY).map(async (folder) => {
          for (let offset = 0; ; offset += LIST_PAGE) {
            const { data, error } = await client.storage
              .from(STORAGE_BUCKET)
              .list(folder, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
            if (error) throw new Error(`storage list failed: ${error.message}`);
            for (const entry of data ?? []) {
              (entry.id ? files : subfolders).push(`${folder}/${entry.name}`);
            }
            if (!data || data.length < LIST_PAGE) break;
          }
        }),
      );
    }
    folders = subfolders;
  }
  return files;
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
