import "server-only";

import { refreshMastery } from "@/lib/adaptive/engine";
import { ensureConcepts } from "@/lib/concepts/service";
import { addMistake, resolveMistake } from "@/lib/mistakes/notebook";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { SELF_CHECK_EXPLANATION, ungradedOf, withUngraded, type PendingMistake, type SelfCheck } from "@/lib/study/results";
import { countSessionAnswer, countSessionGrade, createSession, type CreateSessionInput, loadSession, SessionError } from "@/lib/study/sessions";
import type { ConfidenceLevel, Database, Json, MistakeType, SessionGoal, SessionItemKind, StudySession, StudySessionItem } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared plumbing for the item-based study flows: opening a session,
 * inserting its items, linking them to concepts and loading an item of a
 * session that is still in progress. Ownership is enforced by RLS on every
 * query (the client is the signed-in student's).
 */

export type Client = Awaited<ReturnType<typeof createClient>>;
export type MaterialContext = Awaited<ReturnType<typeof loadMaterialContext>>;

/** What every flow's starter receives from the session builder. */
export type FlowStartInput = {
  materialId: string | null;
  materialIds?: string[];
  goal: SessionGoal | null;
  plannedMinutes: number;
};

export type FlowStartResult = { sessionId: string; redirect: string };

export type ItemRow = {
  session_id: string;
  user_id: string;
  position: number;
  kind: SessionItemKind;
  concept_id: string | null;
  prompt: string;
  model_answer: string | null;
  key_points: Json;
  source_excerpt: string | null;
  source_mistake_id?: string | null;
  material_id?: string | null;
  format?: string | null;
  analysis?: Json;
};

/** Upserts the named concepts for the material's student and returns normalized name → id. */
export async function conceptsFor(supabase: Client, userId: string, context: MaterialContext, names: string[]): Promise<Map<string, string>> {
  return ensureConcepts(supabase, userId, names, { materialId: context.material.id, subjectId: context.material.subject_id });
}

export async function insertItems(supabase: Client, rows: ItemRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("study_session_items").insert(rows);
  if (error) throw new Error(`study_session_items: insert failed: ${error.message}`);
}

export async function openSession(supabase: Client, userId: string, input: Omit<CreateSessionInput, "title"> & { title: string }): Promise<string> {
  const { id } = await createSession(supabase, userId, input);
  return id;
}

export type ItemResult = {
  response: string | null;
  analysis: Json;
  /** null when part of the answer couldn't be scored (a scenario whose reasoning Tamari couldn't check). */
  score: number | null;
  isCorrect: boolean;
  responseMs: number | null;
  confidence?: ConfidenceLevel | null;
  /** Filed in the mistake notebook when the answer is wrong. */
  mistake?: { question: string; correctAnswer: string; explanation: string; errorType?: MistakeType } | null;
  /** The notebook mistake this item retests: marked learned when the answer is right (a wrong answer leaves it open). */
  retestedMistakeId?: string | null;
};

type ItemUpdate = Database["public"]["Tables"]["study_session_items"]["Update"];

/**
 * Stores one attempt at an item. The update matches only while the item is
 * unanswered and still has the attempts it was read with, so of two submits
 * of the same attempt (a double click, a second tab) exactly one is stored.
 * Returns false for the one that came second.
 */
export async function storeItemAttempt(supabase: Client, item: StudySessionItem, values: Omit<ItemUpdate, "attempts">): Promise<boolean> {
  const { data: updated, error } = await supabase
    .from("study_session_items")
    .update({ ...values, attempts: item.attempts + 1 })
    .eq("id", item.id)
    .eq("attempts", item.attempts)
    .is("answered_at", null)
    .select("id");
  if (error) throw new Error(`study_session_items: update failed: ${error.message}`);
  return Boolean(updated?.length);
}

/**
 * What a finished item updates (§51: one answer updates every system that
 * depends on it): the session counters, the mistake notebook and the
 * concept's mastery. Only the request that stored the answer calls this.
 */
export async function settleAnsweredItem(supabase: Client, item: StudySessionItem, session: StudySession, result: Pick<ItemResult, "isCorrect" | "response" | "mistake" | "retestedMistakeId">): Promise<void> {
  await countSessionAnswer(supabase, session.id, { correct: result.isCorrect, index: item.position + 1 });

  if (result.isCorrect && result.retestedMistakeId) {
    await resolveMistake(supabase, result.retestedMistakeId);
  } else if (!result.isCorrect && result.mistake) {
    await addMistake(supabase, {
      userId: session.user_id,
      conceptId: item.concept_id,
      materialId: item.material_id ?? session.material_id,
      question: result.mistake.question,
      studentAnswer: result.response || null,
      correctAnswer: result.mistake.correctAnswer,
      explanation: result.mistake.explanation,
      errorType: result.mistake.errorType,
    });
  }
  if (item.concept_id) await refreshMastery([item.concept_id]);
}

/**
 * Stores an answered item and settles it (counters, notebook, mastery).
 * Returns false when the item had already been answered (a double submit),
 * in which case nothing else is touched.
 */
export async function recordItemResult(supabase: Client, item: StudySessionItem, session: StudySession, result: ItemResult): Promise<boolean> {
  const stored = await storeItemAttempt(supabase, item, {
    response: result.response?.slice(0, 8000) ?? null,
    analysis: result.analysis,
    is_correct: result.isCorrect,
    score: result.score === null ? null : Math.max(0, Math.min(100, Math.round(result.score))),
    confidence: result.confidence ?? null,
    response_ms: result.responseMs,
    answered_at: new Date().toISOString(),
  });
  if (!stored) return false;
  await settleAnsweredItem(supabase, item, session, result);
  return true;
}

/**
 * Stores an answer Tamari couldn't check (lib/study/results.ts): answered, without a grade. It counts as
 * answered but not as right or wrong; the notebook and mastery wait for the student's own mark
 * (selfCheckItem). Returns false when the item had already been answered (a double submit).
 */
export async function recordUngradedItem(
  supabase: Client,
  item: StudySessionItem,
  session: StudySession,
  result: { response: string | null; analysis: Record<string, unknown>; responseMs: number | null; confidence?: ConfidenceLevel | null; mistake?: PendingMistake | null; retestedMistakeId?: string | null },
): Promise<boolean> {
  const stored = await storeItemAttempt(supabase, item, {
    response: result.response?.slice(0, 8000) ?? null,
    analysis: withUngraded(result.analysis, result) as unknown as Json,
    is_correct: null,
    score: null,
    confidence: result.confidence ?? null,
    response_ms: result.responseMs,
    answered_at: new Date().toISOString(),
  });
  if (!stored) return false;
  await countSessionAnswer(supabase, session.id, { correct: null, index: item.position + 1 });
  return true;
}

/**
 * The student's own mark for an answer Tamari couldn't check, given after comparing it with the model answer.
 * From now on it counts like a checked answer: in the session's tally, in the notebook ("not yet" files the
 * mistake; "I got it" on a retest marks the retested mistake learned) and in the concept's mastery.
 */
export async function selfCheckItem(input: { itemId: string; mark: SelfCheck }): Promise<{ mark: SelfCheck }> {
  const supabase = await createClient();
  const { item, session } = await loadOpenItem(supabase, input.itemId);
  const ungraded = ungradedOf(item.analysis);
  if (!item.answered_at || !ungraded) throw new SessionError("Only an answer Tamari couldn't check can be marked.", 409);
  if (ungraded.selfCheck) return { mark: ungraded.selfCheck };
  const isCorrect = input.mark === "correct";
  const analysis = { ...(item.analysis as Record<string, unknown>), ungraded: { ...ungraded, selfCheck: input.mark } };
  // Only while it is still unmarked, so of two clicks (or tabs) exactly one counts.
  const { data: updated, error } = await supabase
    .from("study_session_items")
    .update({ is_correct: isCorrect, analysis: analysis as unknown as Json })
    .eq("id", item.id)
    .is("is_correct", null)
    .not("answered_at", "is", null)
    .select("id");
  if (error) throw new Error(`study_session_items: self-check failed: ${error.message}`);
  if (!updated?.length) return { mark: ungradedOf((await reloadItem(supabase, item.id)).analysis)?.selfCheck ?? input.mark };

  await countSessionGrade(supabase, session.id, isCorrect);
  if (isCorrect && ungraded.retestedMistakeId) {
    await resolveMistake(supabase, ungraded.retestedMistakeId);
  } else if (!isCorrect && ungraded.mistake) {
    await addMistake(supabase, {
      userId: session.user_id,
      conceptId: item.concept_id,
      materialId: item.material_id ?? session.material_id,
      question: ungraded.mistake.question,
      studentAnswer: item.response || null,
      correctAnswer: ungraded.mistake.correctAnswer,
      explanation: ungraded.mistake.explanation || SELF_CHECK_EXPLANATION,
      errorType: ungraded.mistake.errorType,
    });
  }
  if (item.concept_id) await refreshMastery([item.concept_id]);
  return { mark: input.mark };
}

/** An item as it is now (after a submit lost to another one). */
export async function reloadItem(supabase: Client, itemId: string): Promise<StudySessionItem> {
  const { data: item, error } = await supabase.from("study_session_items").select("*").eq("id", itemId).maybeSingle();
  if (error || !item) throw new SessionError("Item not found.", 404);
  return item;
}

/** Saves a draft answer for an unanswered item so a refresh does not lose it (§53). */
export async function saveItemDraft(itemId: string, draft: string): Promise<void> {
  const supabase = await createClient();
  const { item } = await loadOpenItem(supabase, itemId);
  if (item.answered_at) return;
  const { error } = await supabase.from("study_session_items").update({ response: draft.slice(0, 8000) }).eq("id", item.id).is("answered_at", null);
  if (error) throw new Error(`study_session_items: draft failed: ${error.message}`);
}

/** Loads an item together with its session; the session must still be in progress. */
export async function loadOpenItem(supabase: Client, itemId: string): Promise<{ item: StudySessionItem; session: StudySession }> {
  const { data: item } = await supabase.from("study_session_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) throw new SessionError("Item not found.", 404);
  const session = await loadSession(supabase, item.session_id);
  if (session.status !== "in_progress") throw new SessionError("This session is already finished.", 409);
  return { item, session };
}
