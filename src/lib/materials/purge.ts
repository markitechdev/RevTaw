import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { removeMaterialObjects } from "@/lib/materials/storage";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Permanent deletion of archived materials ("Delete permanently" in the
 * Archive). The file in storage, the
 * extracted text and the analysis go for good; the material row stays with
 * status "deleted" so every reviewer, quiz, flashcard deck, memory aid and
 * bit of progress made from it keeps its title, subject and folder.
 *
 * The row is claimed first (status "deleted", purged_at set) so a restore
 * racing the purge can never bring back a material whose file is going. The
 * file and text are deleted next, and only then is storage_path cleared, so
 * a purge that fails half-way is finished on the next run.
 */

type Client = SupabaseClient<Database>;
type Candidate = { id: string; storage_path: string | null; purged_at: string | null };

/** Purges the given archived materials; returns how many were finished. Never throws. */
export async function purgeMaterials(client: Client, candidates: Candidate[]): Promise<number> {
  if (candidates.length === 0) return 0;
  const claimed: Array<{ id: string; storage_path: string | null }> = candidates.filter((row) => row.purged_at);
  const fresh = candidates.filter((row) => !row.purged_at).map((row) => row.id);
  if (fresh.length > 0) {
    const { data, error } = await client
      .from("materials")
      .update({ status: "deleted", status_detail: null, purged_at: new Date().toISOString() })
      .in("id", fresh)
      .not("archived_at", "is", null)
      .is("purged_at", null)
      .select("id, storage_path");
    if (error) console.error("materials: purge claim failed", error.message);
    claimed.push(...(data ?? []));
  }
  if (claimed.length === 0) return 0;

  const ids = claimed.map((row) => row.id);
  try {
    await removeMaterialObjects(client, claimed.map((row) => row.storage_path ?? ""));
  } catch (error) {
    console.error("materials: purge storage cleanup failed", error);
    return 0;
  }
  const [chunks, analysis] = await Promise.all([
    client.from("material_chunks").delete().in("material_id", ids),
    client.from("material_analyses").delete().in("material_id", ids),
  ]);
  if (chunks.error || analysis.error) {
    console.error("materials: purge text cleanup failed", chunks.error?.message ?? analysis.error?.message);
    return 0;
  }
  const { data: finished, error } = await client
    .from("materials")
    .update({ storage_path: null, content_hash: null, original_filename: null })
    .in("id", ids)
    .select("id");
  if (error) {
    console.error("materials: purge finish failed", error.message);
    return 0;
  }
  return (finished ?? []).length;
}
