"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isAiError } from "@/lib/ai";
import { routes } from "@/lib/routes";
import type { SessionSummary } from "@/lib/study/sessions";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { addMessageToNotes, completeTutorSession, createConversation, createFlashcardFromMessage, sendMessage, ServiceError, SessionError } from "@/lib/tutor/service";
import { TUTOR_ACTION_IDS } from "@/lib/tutor/types";

export type TutorActionResult<T = undefined> = ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T })) | { ok: false; message: string };

const uuid = z.uuid();

function failure(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof ServiceError || error instanceof SessionError) return { ok: false, message: error.message };
  if (isAiError(error)) return { ok: false, message: error.message };
  console.error(fallback, error);
  return { ok: false, message: fallback };
}

function revalidate(conversationId?: string) {
  revalidatePath(routes.tutor);
  if (conversationId) revalidatePath(`${routes.tutor}/${conversationId}`);
}

/** Highlight-and-ask: opens a conversation on the material and sends the selected text with the chosen action. */
export async function askFromSelectionAction(input: { materialId: string; action: string; selection: string; question?: string | null }): Promise<TutorActionResult<{ conversationId: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z
    .object({ materialId: uuid, action: z.enum(TUTOR_ACTION_IDS), selection: z.string().trim().min(1).max(4000), question: z.string().trim().max(2000).nullable().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Select some text first." };
  try {
    const supabase = await createClient();
    // Reuse the most recent free conversation on this material so highlights build one thread.
    const { data: existing } = await supabase
      .from("tutor_conversations")
      .select("id")
      .eq("material_id", parsed.data.materialId)
      .in("mode", ["tutor", "guided"])
      .is("session_id", null)
      .is("archived_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const conversationId = existing?.id ?? (await createConversation({ materialId: parsed.data.materialId, mode: "tutor" })).id;
    await sendMessage({ conversationId, content: parsed.data.question ?? "", action: parsed.data.action, selection: parsed.data.selection });
    revalidate(conversationId);
    return { ok: true, data: { conversationId } };
  } catch (error) {
    return failure(error, "The tutor could not be reached. Please try again.");
  }
}

export async function addToNotesAction(messageId: string): Promise<TutorActionResult<{ reviewerId: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = uuid.safeParse(messageId);
  if (!parsed.success) return { ok: false, message: "Invalid message." };
  try {
    const result = await addMessageToNotes(parsed.data);
    revalidatePath(routes.notes);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "The answer could not be added to your notes.");
  }
}

export async function createFlashcardAction(input: { messageId: string; front: string; back: string }): Promise<TutorActionResult<{ deckId: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ messageId: uuid, front: z.string().trim().min(1).max(500), back: z.string().trim().min(1).max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "The card needs a front and a back." };
  try {
    const result = await createFlashcardFromMessage(parsed.data.messageId, { front: parsed.data.front, back: parsed.data.back });
    revalidatePath(routes.flashcards);
    revalidatePath(routes.dashboard);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "The flashcard could not be created.");
  }
}

export async function renameConversationAction(conversationId: string, title: string): Promise<TutorActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ conversationId: uuid, title: z.string().trim().min(1).max(160) }).safeParse({ conversationId, title });
  if (!parsed.success) return { ok: false, message: "Enter a title of up to 160 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("tutor_conversations").update({ title: parsed.data.title }).eq("id", parsed.data.conversationId);
  if (error) return { ok: false, message: "The title could not be saved." };
  revalidate(parsed.data.conversationId);
  return { ok: true };
}

export async function setConversationModeAction(conversationId: string, mode: "tutor" | "guided"): Promise<TutorActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ conversationId: uuid, mode: z.enum(["tutor", "guided"]) }).safeParse({ conversationId, mode });
  if (!parsed.success) return { ok: false, message: "Invalid mode." };
  const supabase = await createClient();
  const { error } = await supabase.from("tutor_conversations").update({ mode: parsed.data.mode }).eq("id", parsed.data.conversationId).is("session_id", null);
  if (error) return { ok: false, message: "The mode could not be changed." };
  revalidate(parsed.data.conversationId);
  return { ok: true };
}

export async function deleteConversationAction(conversationId: string): Promise<TutorActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = uuid.safeParse(conversationId);
  if (!parsed.success) return { ok: false, message: "Invalid conversation." };
  const supabase = await createClient();
  const { error } = await supabase.from("tutor_conversations").delete().eq("id", parsed.data);
  if (error) return { ok: false, message: "The conversation could not be deleted." };
  revalidate();
  return { ok: true };
}

export async function completeTutorSessionAction(sessionId: string): Promise<TutorActionResult<SessionSummary>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = uuid.safeParse(sessionId);
  if (!parsed.success) return { ok: false, message: "Invalid session." };
  try {
    const summary = await completeTutorSession(parsed.data);
    revalidatePath(routes.study);
    revalidatePath(`${routes.study}/${parsed.data}`);
    revalidatePath(routes.dashboard);
    return { ok: true, data: summary };
  } catch (error) {
    return failure(error, "The session could not be evaluated.");
  }
}
