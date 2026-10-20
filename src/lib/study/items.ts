import "server-only";

import { ensureConcepts } from "@/lib/concepts/service";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { createSession, loadSession, SessionError, type CreateSessionInput } from "@/lib/study/sessions";
import type { Json, SessionGoal, SessionItemKind, StudySession, StudySessionItem } from "@/lib/supabase/database.types";
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

/** Loads an item together with its session; the session must still be in progress. */
export async function loadOpenItem(supabase: Client, itemId: string): Promise<{ item: StudySessionItem; session: StudySession }> {
  const { data: item } = await supabase.from("study_session_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) throw new SessionError("Item not found.", 404);
  const session = await loadSession(supabase, item.session_id);
  if (session.status !== "in_progress") throw new SessionError("This session is already finished.", 409);
  return { item, session };
}
