import "server-only";

import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Canonical key for a concept name so "Linked Lists" and "linked list" share a row. */
export function normalizeConceptName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/s$/, "")
    .slice(0, 120);
}

/**
 * Finds or creates the student's concept rows for the given names and returns
 * a map from normalized name to concept id. One concept row per distinct name
 * per student (§56 master concept model), shared by quizzes, mistakes and,
 * later, mastery tracking.
 */
export async function ensureConcepts(
  supabase: Client,
  userId: string,
  names: string[],
  origin: { materialId: string | null; subjectId: string | null },
): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim().slice(0, 120);
    const key = normalizeConceptName(trimmed);
    if (key && !byKey.has(key)) byKey.set(key, trimmed);
  }
  const result = new Map<string, string>();
  if (byKey.size === 0) return result;

  const rows = [...byKey.entries()].map(([normalized_name, name]) => ({
    user_id: userId,
    name,
    normalized_name,
    material_id: origin.materialId,
    subject_id: origin.subjectId,
  }));

  const { error } = await supabase.from("concepts").upsert(rows, { onConflict: "user_id,normalized_name", ignoreDuplicates: true });
  if (error) {
    console.error("concepts: upsert failed", error.message);
  }

  const { data } = await supabase
    .from("concepts")
    .select("id, normalized_name")
    .in("normalized_name", [...byKey.keys()]);
  for (const row of data ?? []) result.set(row.normalized_name, row.id);
  return result;
}
