import "server-only";

import { cache } from "react";

import { listMastery, type MasteryView } from "@/lib/adaptive/engine";
import { conceptMaterialIds, isWeakTopic } from "@/lib/adaptive/mastery";
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
 * would help it most — one click away. A concept shows under every material
 * it appears in, as on that material's page; a subject counts it once.
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

/** `weakTopics`: its weak topics as Home names them (isWeakTopic). */
export type MapMaterial = { id: string | null; title: string; href: string | null; concepts: MapConcept[]; averageMastery: number | null; counts: Record<MasteryStatus, number>; weakTopics: number };
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
  const materialIds = [...new Set(rows.flatMap((row) => conceptMaterialIds(row.concept)))];
  const [{ data: materials }, { data: analyses }] = await Promise.all([
    materialIds.length ? supabase.from("materials").select("id, title, subject:subjects!materials_subject_fk(id, name)").in("id", materialIds) : Promise.resolve({ data: [] as Array<{ id: string; title: string; subject: unknown }> }),
    materialIds.length ? supabase.from("material_analyses").select("material_id, data").in("material_id", materialIds) : Promise.resolve({ data: [] as Array<{ material_id: string; data: unknown }> }),
  ]);
  const materialById = new Map((materials ?? []).map((material) => [material.id, { title: material.title, subject: (material.subject as { id: string; name: string } | null) ?? null }]));
  const categories = new Map<string, Map<string, ConceptCategory>>();
  for (const analysis of analyses ?? []) categories.set(analysis.material_id, new Map(parseAnalysisData(analysis.data).key_concepts.map((concept) => [normalizeConceptName(concept.name), concept.category])));

  type SubjectEntry = MapSubject & { materialMap: Map<string, MapMaterial>; conceptMastery: Map<string, number> };
  const subjects = new Map<string, SubjectEntry>();
  const counts = emptyCounts();
  for (const row of rows) {
    const concept = row.concept!;
    counts[row.status] += 1;
    const placements: Array<string | null> = conceptMaterialIds(concept);
    for (const materialId of placements.length ? placements : [null]) {
      const material = materialId ? materialById.get(materialId) : undefined;
      const subject = material?.subject ?? null;
      const subjectKey = subject?.id ?? "none";
      const entry = subjects.get(subjectKey) ?? { id: subject?.id ?? null, name: subject?.name ?? "No subject", materials: [], averageMastery: null, concepts: 0, materialMap: new Map(), conceptMastery: new Map() };
      const materialKey = materialId ?? "none";
      const title = material?.title ?? (concept.material?.id === materialId ? concept.material?.title : null) ?? (materialId ? "Material" : "No material");
      const materialEntry = entry.materialMap.get(materialKey) ?? { id: materialId, title, href: materialId ? `${routes.materials}/${materialId}` : null, concepts: [], averageMastery: null, counts: emptyCounts(), weakTopics: 0 };
      const category = (materialId ? categories.get(materialId)?.get(normalizeConceptName(concept.name)) : null) ?? null;
      materialEntry.concepts.push({
        id: concept.id,
        name: concept.name,
        mastery: Math.round(Number(row.mastery)),
        status: row.status,
        attempts: row.attempts,
        misconceptions: row.misconceptions,
        category,
        recommendation: recommendForConcept(row, category, materialId),
      });
      materialEntry.counts[row.status] += 1;
      if (isWeakTopic(row)) materialEntry.weakTopics += 1;
      entry.materialMap.set(materialKey, materialEntry);
      entry.conceptMastery.set(concept.id, Math.round(Number(row.mastery)));
      subjects.set(subjectKey, entry);
    }
  }
  const result: MapSubject[] = [...subjects.values()].map(({ materialMap, conceptMastery, ...subject }) => {
    const mats = [...materialMap.values()].map((material) => ({ ...material, concepts: material.concepts.sort((a, b) => a.mastery - b.mastery), averageMastery: average(material.concepts.map((concept) => concept.mastery)) }));
    // A concept in two of the subject's materials counts once.
    return { ...subject, concepts: conceptMastery.size, materials: mats.sort((a, b) => (a.averageMastery ?? 0) - (b.averageMastery ?? 0)), averageMastery: average([...conceptMastery.values()]) };
  });
  return { subjects: result.sort((a, b) => (a.averageMastery ?? 0) - (b.averageMastery ?? 0)), total: rows.length, counts };
});
