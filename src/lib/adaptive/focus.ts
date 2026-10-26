import "server-only";

import { cache } from "react";

import { listMastery, type MasteryView } from "@/lib/adaptive/engine";
import { conceptCategories, DEFAULT_CATEGORY } from "@/lib/adaptive/evidence";
import { conceptMaterialIds, isWeakTopic, type ConceptMaterials } from "@/lib/adaptive/mastery";
import { chooseMethod, PLAN_METHODS, type MethodPick } from "@/lib/engine/method-rules";
import { rankByPriority, type PriorityInput, type Ranked } from "@/lib/engine/priority";
import type { ConceptState } from "@/lib/engine/types";
import type { ConceptCategory } from "@/lib/materials/analysis-schema";
import { zonedInstant } from "@/lib/planner/time";
import { getNextExam, type ExamSummary } from "@/lib/planner/queries";
import { plannerClock } from "@/lib/planner/service";
import { BUILDER_METHOD_IDS } from "@/lib/study/catalog";
import type { StudyMethodId } from "@/lib/study/methods";
import { createClient } from "@/lib/supabase/server";

/**
 * What to study next (research doc §10–§11), shared by Tamari's plan and the
 * recommendations: every concept the student has practiced (and, when
 * asked, the ones in scope they haven't touched) ranked by
 *
 *   priority = relevance × urgency × need × freshness,
 *
 * and for each one the method the rule table picks. Read with the student's
 * own session (RLS).
 */

/** An exam this close makes its materials "in scope". */
export const EXAM_HORIZON_DAYS = 14;

export type FocusConcept = {
  id: string;
  name: string;
  materialId: string | null;
  /** The mastery row; null for a concept never practiced. */
  row: MasteryView | null;
  state: ConceptState;
  category: ConceptCategory;
  inScope: boolean;
  daysToExam: number | null;
  priorityInput: PriorityInput;
};

export type RankedConcept = Ranked<FocusConcept>;

/** The exam that shapes priorities: the next one within the horizon. */
export async function examInScope(): Promise<ExamSummary | null> {
  const exam = await getNextExam();
  return exam && exam.daysLeft >= 0 && exam.daysLeft <= EXAM_HORIZON_DAYS ? exam : null;
}

/** Answers per concept so far today (about ten minutes' worth halves a concept's freshness). */
const answersToday = cache(async (): Promise<Map<string, number>> => {
  const supabase = await createClient();
  const { timezone, today } = await plannerClock();
  const since = zonedInstant(today, "00:00", timezone).toISOString();
  const [{ data: answers }, { data: items }] = await Promise.all([
    supabase.from("quiz_answers").select("question:quiz_questions!quiz_answers_question_fk!inner(concept_id)").gte("answered_at", since).not("question.concept_id", "is", null).limit(1000),
    supabase.from("study_session_items").select("concept_id").gte("answered_at", since).not("concept_id", "is", null).limit(1000),
  ]);
  const counts = new Map<string, number>();
  const add = (id: string | null | undefined) => {
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  for (const row of answers ?? []) add((row.question as unknown as { concept_id: string | null } | null)?.concept_id);
  for (const row of items ?? []) add(row.concept_id);
  return counts;
});

/**
 * Ranks concepts, highest priority first. `materialId` keeps one material's
 * concepts; `includeUnpracticed` adds concepts never practiced from that
 * material (or, without one, from the exam's materials) so coverage counts.
 */
export async function rankConcepts(options: { materialId?: string | null; includeUnpracticed?: boolean } = {}): Promise<RankedConcept[]> {
  const [rows, exam, today] = await Promise.all([listMastery(), examInScope(), answersToday()]);
  const examMaterials = new Set((exam?.materials ?? []).map((material) => material.id));
  // A concept belongs to every material it appears in, not only the one it was first made from.
  const keep = (concept: ConceptMaterials) => !options.materialId || conceptMaterialIds(concept).includes(options.materialId);
  const practiced = rows.filter((row) => row.attempts > 0 && row.concept && keep(row.concept));

  let unpracticed: Array<{ id: string; name: string; material_id: string | null; links: Array<{ material_id: string }> }> = [];
  // Never-practiced concepts only from materials that can still be studied (a deleted file has nothing to learn from).
  const scope = options.materialId ? [options.materialId] : (exam?.materials ?? []).filter((material) => material.status !== "deleted").map((material) => material.id);
  if (options.includeUnpracticed && scope.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("concept_materials")
      .select("material_id, concept:concepts!concept_materials_concept_fk(id, name, material_id)")
      .in("material_id", scope)
      .order("created_at")
      .limit(300);
    const seen = new Set(rows.filter((row) => row.attempts > 0).map((row) => row.concept_id));
    const byId = new Map<string, (typeof unpracticed)[number]>();
    for (const link of (data ?? []) as unknown as Array<{ material_id: string; concept: { id: string; name: string; material_id: string | null } | null }>) {
      if (!link.concept || seen.has(link.concept.id)) continue;
      const entry = byId.get(link.concept.id) ?? { ...link.concept, links: [] };
      entry.links.push({ material_id: link.material_id });
      byId.set(link.concept.id, entry);
    }
    unpracticed = [...byId.values()];
  }

  const supabase = await createClient();
  const categories = await conceptCategories(supabase, [...practiced.map((row) => row.concept_id), ...unpracticed.map((concept) => concept.id)]);
  /** In the exam's scope when any of its materials is; studied from the material asked for, else one in scope, else its first. */
  const context = (concept: ConceptMaterials) => {
    const materials = conceptMaterialIds(concept);
    const scoped = exam ? materials.find((id) => examMaterials.has(id)) : undefined;
    const inScope = scoped !== undefined;
    return { inScope, daysToExam: inScope && exam ? exam.daysLeft : null, anyExam: Boolean(exam), materialId: options.materialId ?? scoped ?? concept.material_id ?? materials[0] ?? null };
  };
  const items: FocusConcept[] = [
    ...practiced.map((row) => {
      const where = context(row.concept!);
      return {
        id: row.concept_id,
        name: row.concept!.name,
        materialId: where.materialId,
        row,
        state: row.status,
        category: categories.get(row.concept_id) ?? DEFAULT_CATEGORY,
        inScope: where.inScope,
        daysToExam: where.daysToExam,
        priorityInput: {
          inScope: where.inScope,
          anyExam: where.anyExam,
          daysToExam: where.daysToExam,
          weakness: Number(row.weakness),
          recall: row.recall === null ? null : Number(row.recall),
          practiced: true,
          answersToday: today.get(row.concept_id) ?? 0,
        },
      };
    }),
    ...unpracticed.map((concept) => {
      const where = context(concept);
      return {
        id: concept.id,
        name: concept.name,
        materialId: where.materialId,
        row: null,
        state: "new" as const,
        category: categories.get(concept.id) ?? DEFAULT_CATEGORY,
        inScope: where.inScope,
        daysToExam: where.daysToExam,
        priorityInput: { inScope: where.inScope, anyExam: where.anyExam, daysToExam: where.daysToExam, weakness: 0, recall: null, practiced: false, answersToday: 0 },
      };
    }),
  ];
  return rankByPriority(items);
}

/** A ranked concept that is a weak topic (the shared definition in adaptive/mastery). */
export function isWeakConcept(concept: FocusConcept): boolean {
  return concept.row !== null && isWeakTopic(concept.row);
}

/** Methods a Tamari plan block can run (a block can't nest a plan of its own). */
export const BLOCK_METHODS: ReadonlySet<StudyMethodId> = new Set(BUILDER_METHOD_IDS.filter((id) => !PLAN_METHODS.has(id)));

/** The method the rule table picks for a concept, with its one-line reason. */
export function methodFor(concept: FocusConcept, minutes: number, options: { allowed?: ReadonlySet<StudyMethodId>; dueCards?: boolean; misconceptionDue?: boolean } = {}): MethodPick {
  return chooseMethod({
    state: concept.state,
    category: concept.category,
    openMisconception: (concept.row?.misconceptions ?? 0) > 0,
    misconceptionDue: options.misconceptionDue,
    daysToExam: concept.daysToExam,
    minutes,
    allowed: options.allowed,
    dueCards: options.dueCards,
  });
}
