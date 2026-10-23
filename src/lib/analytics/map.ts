import "server-only";

import { cache } from "react";

import { listMastery, type MasteryView } from "@/lib/adaptive/engine";
import { normalizeConceptName } from "@/lib/concepts/service";
import { parseAnalysisData, type ConceptCategory } from "@/lib/materials/analysis-schema";
import { chooseMethod } from "@/lib/engine/method-rules";
import { routes } from "@/lib/routes";
import { BUILDER_METHOD_IDS, methodName } from "@/lib/study/catalog";
import type { StudyMethodId } from "@/lib/study/methods";
import type { MasteryStatus } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * The knowledge / mastery map (spec §24): subjects → materials → concepts,
 * each with its mastery and status, and for every concept the session that
 * would help it most — one click away.
 */

export type MapConcept = {
  id: string;
  name: string;
  mastery: number;
  status: MasteryStatus;
  attempts: number;
  misconceptions: number;
  category: ConceptCategory | null;
  /** The recommended next session for this concept, with the reason. */
  recommendation: { method: StudyMethodId; label: string; reason: string; href: string };
};

export type MapMaterial = { id: string | null; title: string; href: string | null; concepts: MapConcept[]; averageMastery: number | null; counts: Record<MasteryStatus, number> };
export type MapSubject = { id: string | null; name: string; materials: MapMaterial[]; averageMastery: number | null; concepts: number };

export type MasteryMap = { subjects: MapSubject[]; total: number; counts: Record<MasteryStatus, number> };

/** The map links can start any session the study builder runs, except Tamari's own plan. */
const STARTABLE: ReadonlySet<StudyMethodId> = new Set(BUILDER_METHOD_IDS.filter((id) => id !== "smart_study"));

/** The session the rule table picks for one concept (research doc §11), with its reason. */
export function recommendForConcept(row: Pick<MasteryView, "status" | "misconceptions">, category: ConceptCategory | null, materialId: string | null): MapConcept["recommendation"] {
  const pick = chooseMethod({ state: row.status, category: category ?? "understanding", openMisconception: row.misconceptions > 0, daysToExam: null, minutes: 15, allowed: STARTABLE });
  const params = new URLSearchParams({ method: pick.method });
  if (materialId) params.set("material", materialId);
  const href = pick.method === "spaced_repetition" || pick.method === "flashcards" ? `${routes.flashcards}/review` : `${routes.study}?${params.toString()}`;
  return { method: pick.method, label: methodName(pick.method), reason: pick.reason, href };
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function emptyCounts(): Record<MasteryStatus, number> {
  return { new: 0, weak: 0, learning: 0, developing: 0, strong: 0, mastered: 0 };
}

export const getMasteryMap = cache(async (): Promise<MasteryMap> => {
  const supabase = await createClient();
  const rows = (await listMastery()).filter((row) => row.attempts > 0 && row.concept);
  const materialIds = [...new Set(rows.map((row) => row.concept!.material_id).filter((id): id is string => Boolean(id)))];
  const [{ data: materials }, { data: analyses }] = await Promise.all([
    materialIds.length ? supabase.from("materials").select("id, title, subject:subjects!materials_subject_fk(id, name)").in("id", materialIds) : Promise.resolve({ data: [] as Array<{ id: string; title: string; subject: unknown }> }),
    materialIds.length ? supabase.from("material_analyses").select("material_id, data").in("material_id", materialIds) : Promise.resolve({ data: [] as Array<{ material_id: string; data: unknown }> }),
  ]);
  const materialById = new Map((materials ?? []).map((material) => [material.id, { title: material.title, subject: (material.subject as { id: string; name: string } | null) ?? null }]));
  const categories = new Map<string, Map<string, ConceptCategory>>();
  for (const analysis of analyses ?? []) categories.set(analysis.material_id, new Map(parseAnalysisData(analysis.data).key_concepts.map((concept) => [normalizeConceptName(concept.name), concept.category])));

  const subjects = new Map<string, MapSubject & { materialMap: Map<string, MapMaterial> }>();
  const counts = emptyCounts();
  for (const row of rows) {
    const concept = row.concept!;
    const material = concept.material_id ? materialById.get(concept.material_id) : undefined;
    const subject = material?.subject ?? null;
    const subjectKey = subject?.id ?? "none";
    const entry = subjects.get(subjectKey) ?? { id: subject?.id ?? null, name: subject?.name ?? "No subject", materials: [], averageMastery: null, concepts: 0, materialMap: new Map() };
    const materialKey = concept.material_id ?? "none";
    const materialEntry = entry.materialMap.get(materialKey) ?? { id: concept.material_id, title: material?.title ?? concept.material?.title ?? "No material", href: concept.material_id ? `${routes.materials}/${concept.material_id}` : null, concepts: [], averageMastery: null, counts: emptyCounts() };
    const category = (concept.material_id ? categories.get(concept.material_id)?.get(normalizeConceptName(concept.name)) : null) ?? null;
    materialEntry.concepts.push({
      id: concept.id,
      name: concept.name,
      mastery: Math.round(Number(row.mastery)),
      status: row.status,
      attempts: row.attempts,
      misconceptions: row.misconceptions,
      category,
      recommendation: recommendForConcept(row, category, concept.material_id),
    });
    materialEntry.counts[row.status] += 1;
    counts[row.status] += 1;
    entry.materialMap.set(materialKey, materialEntry);
    entry.concepts += 1;
    subjects.set(subjectKey, entry);
  }
  const result: MapSubject[] = [...subjects.values()].map(({ materialMap, ...subject }) => {
    const mats = [...materialMap.values()].map((material) => ({ ...material, concepts: material.concepts.sort((a, b) => a.mastery - b.mastery), averageMastery: average(material.concepts.map((concept) => concept.mastery)) }));
    return { ...subject, materials: mats.sort((a, b) => (a.averageMastery ?? 0) - (b.averageMastery ?? 0)), averageMastery: average(mats.flatMap((material) => material.concepts.map((concept) => concept.mastery))) };
  });
  return { subjects: result.sort((a, b) => (a.averageMastery ?? 0) - (b.averageMastery ?? 0)), total: rows.length, counts };
});
