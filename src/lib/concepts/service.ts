import "server-only";

import { parseAnalysisData } from "@/lib/materials/analysis-schema";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Canonical key for a concept name so "Linked Lists" and "linked list" share a row. Plus and sharp signs
 * are spelled out first, because they tell names apart: C, C++ and C# stay three concepts.
 */
export function normalizeConceptName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\+/g, " plus ")
    .replace(/[#♯]/g, " sharp ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/s$/, "")
    .slice(0, 120);
}

/**
 * Words that wrap a concept without changing it: "the process of photosynthesis" is photosynthesis. Only
 * wrappers that seldom name a concept of their own: "function of", "types of" and a trailing "concept" or
 * "meaning" are kept ("types of tissue", "self-concept", "word meaning"). Taking a wrapper off only ever
 * joins a name to a concept that exists; no concept is renamed.
 */
const WRAPPER_PREFIX = /^(?:the )?(?:process|definition|meaning|role|importance|concept|idea|basics|overview|introduction) (?:of|to) (?:the |an |a )?/;
/** The same at the end, in normalized form: "photosynthesis process" normalizes to "photosynthesis proces". */
const WRAPPER_SUFFIX = / (?:proces|definition|overview)$/;

/**
 * The concept a normalized name is about once its wrapper words are gone ("photosynthesis process", "role
 * of the stroma"), as a normalized key; the key itself when there is nothing to strip.
 */
export function conceptCore(key: string): string {
  let core = key;
  // Wrappers can nest ("overview of the process of photosynthesis"); a few rounds take them all off.
  for (let round = 0; round < 3; round += 1) {
    let next = core.replace(WRAPPER_PREFIX, "");
    // The end the suffix leaves is normalized like any other: "photosynthesis" → "photosynthesi".
    if (WRAPPER_SUFFIX.test(next)) next = next.replace(WRAPPER_SUFFIX, "").replace(/^the(?: |$)/, "").replace(/s$/, "");
    next = next.trim();
    if (next === core || next.length < 3) break;
    core = next;
  }
  return core;
}

/**
 * Finds or creates the student's concept rows for the given names and returns
 * a map from normalized name to concept id. One concept row per distinct name
 * per student (§56 master concept model), shared by quizzes, mistakes and
 * mastery tracking. A name that only wraps a concept the student already has
 * ("Photosynthesis process" next to "Photosynthesis", either way round) joins
 * that concept, so its answers count toward the same mastery instead of
 * starting a new one; so do such names given together.
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

  // The student's concepts under these names or their cores, and the ones made from this material so far
  // (a wrapped name there, "Photosynthesis process", is the concept a plain "Photosynthesis" joins).
  const cores = new Map([...byKey.keys()].map((key) => [key, conceptCore(key)]));
  const lookup = [...new Set([...byKey.keys(), ...cores.values()])];
  const [{ data: named }, fromMaterial] = await Promise.all([
    supabase.from("concepts").select("id, normalized_name").eq("user_id", userId).in("normalized_name", lookup),
    origin.materialId
      ? supabase.from("concepts").select("id, normalized_name").eq("user_id", userId).eq("material_id", origin.materialId).order("created_at").limit(500)
      : null,
  ]);
  const known = new Map((named ?? []).map((row) => [row.normalized_name, row.id]));
  const byCore = new Map<string, string>();
  for (const row of [...(named ?? []), ...(fromMaterial?.data ?? [])]) {
    const core = conceptCore(row.normalized_name);
    if (!byCore.has(core)) byCore.set(core, row.id);
  }

  const create = new Map<string, string>();
  // A new name that shares its core with another new one joins it: the plain name when one is given.
  const joins = new Map<string, string>();
  const ownerOfCore = new Map<string, string>();
  for (const [key, name] of byKey) {
    const core = cores.get(key) ?? key;
    const id = known.get(key) ?? known.get(core) ?? byCore.get(core);
    if (id) {
      result.set(key, id);
      continue;
    }
    const owner = byKey.has(core) ? core : (ownerOfCore.get(core) ?? key);
    ownerOfCore.set(core, owner);
    if (owner === key) create.set(key, name);
    else joins.set(key, owner);
  }
  if (create.size === 0) return result;

  const rows = [...create.entries()].map(([normalized_name, name]) => ({
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
    .eq("user_id", userId)
    .in("normalized_name", [...create.keys()]);
  for (const row of data ?? []) result.set(row.normalized_name, row.id);
  // Every join's owner was just created (a name with an id of its own would have given the join one too).
  for (const [key, owner] of joins) {
    const id = result.get(owner);
    if (id) result.set(key, id);
  }
  return result;
}

/**
 * The names a material's concepts go by, for generators to reuse so the same concept keeps one name (and
 * one mastery): the material analysis's key concepts first, then the concepts made from it so far.
 */
export async function materialConceptNames(supabase: Client, material: { id: string; user_id: string }, max = 60): Promise<string[]> {
  const [{ data: analysis }, { data: rows }] = await Promise.all([
    supabase.from("material_analyses").select("key_concepts:data->key_concepts").eq("material_id", material.id).maybeSingle(),
    supabase.from("concepts").select("name").eq("user_id", material.user_id).eq("material_id", material.id).order("created_at").limit(120),
  ]);
  const analysed = parseAnalysisData({ key_concepts: analysis?.key_concepts ?? [] }).key_concepts.map((concept) => concept.name);
  const names = new Map<string, string>();
  for (const name of [...analysed, ...(rows ?? []).map((row) => row.name)]) {
    const key = normalizeConceptName(name);
    if (key && !names.has(key)) names.set(key, name.trim().replace(/\s+/g, " "));
  }
  return [...names.values()].slice(0, max);
}

/** The prompt line that lists a material's concept names for a generator (empty when it has none yet). */
export function knownConceptsLine(names: string[]): string {
  if (names.length === 0) return "";
  return `Concept names this material already uses (for an item on one of these concepts, use its name exactly): ${names.map((name) => `"${name.replace(/"/g, "'")}"`).join(", ")}\n`;
}
