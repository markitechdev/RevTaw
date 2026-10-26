import "server-only";

import { retestViewFor } from "@/lib/mistakes/retest";
import { retestCutoff } from "@/lib/quizzes/queries";
import type { Client, ItemRow } from "@/lib/study/items";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Notebook entries as retest items, for error review, rapid review and Tamari's Mistake Review
 * (lib/mistakes/retest.ts has the rules).
 */

export type RetestMistake = {
  id: string;
  question_text: string;
  correct_answer: string;
  explanation: string | null;
  concept_id: string | null;
  material_id: string | null;
  choices: Json | null;
  context: string | null;
  material: { title: string } | null;
};

const RETEST_COLUMNS = "id, question_text, correct_answer, explanation, concept_id, material_id, choices, context, material:materials!mistakes_material_fk(title)";

/**
 * Open entries to retest (of one material, or all), the longest-standing miss first: a missed retest dates
 * its miss again, so it waits behind the others. Only the ones missed before today while there are any: a
 * right retest clears those now, and today's count only from tomorrow. With none of those, today's mistakes
 * are retested for practice.
 */
export async function mistakesToRetest(supabase: Client, options: { materialId: string | null; limit: number }): Promise<RetestMistake[]> {
  const cutoff = await retestCutoff();
  const read = async (dueOnly: boolean) => {
    let query = supabase
      .from("mistakes")
      .select(RETEST_COLUMNS)
      .is("resolved_at", null)
      .order("last_missed_at", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id")
      .limit(Math.max(1, options.limit));
    if (options.materialId) query = query.eq("material_id", options.materialId);
    if (dueOnly) query = query.lt("last_missed_at", cutoff);
    const { data, error } = await query;
    if (error) throw new Error(`mistakes: retest read failed: ${error.message}`);
    return (data ?? []) as unknown as RetestMistake[];
  };
  const due = await read(true);
  return due.length > 0 ? due : read(false);
}

/**
 * A notebook entry as a retest item: its question, with the choices or context it needs. Its explanation is
 * shown once it is answered (like a source quote, it would give the answer away before).
 */
export function retestItem(mistake: RetestMistake, base: { sessionId: string; userId: string; position: number }): ItemRow {
  const view = retestViewFor(mistake);
  return {
    session_id: base.sessionId,
    user_id: base.userId,
    position: base.position,
    kind: "mistake",
    concept_id: mistake.concept_id,
    prompt: mistake.question_text,
    model_answer: mistake.correct_answer,
    key_points: [] as unknown as Json,
    source_excerpt: mistake.explanation?.slice(0, 1000) || null,
    source_mistake_id: mistake.id,
    material_id: mistake.material_id,
    format: null,
    ...(view.choices || view.context ? { analysis: { retest: view } as unknown as Json } : {}),
  };
}
