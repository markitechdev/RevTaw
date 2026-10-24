import "server-only";

import { cache } from "react";

import type { Page } from "@/lib/pagination";
import type { Visual } from "@/lib/study/visuals";
import type { TutorConversation, TutorMessage } from "@/lib/supabase/database.types";
import { fetchPage } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";
import type { FlashcardDraft, FollowUpId, TutorSource } from "@/lib/tutor/types";

export type ConversationListItem = Pick<TutorConversation, "id" | "material_id" | "session_id" | "title" | "mode" | "message_count" | "last_message_at" | "created_at"> & {
  material: { id: string; title: string } | null;
};

const CONVERSATION_COLUMNS = "id, material_id, session_id, title, mode, message_count, last_message_at, created_at, material:materials!tutor_conversations_material_fk(id, title)";

/** The most recent conversations (Tamari's history list asks for a few). */
export async function listConversations(filters: { materialId?: string; limit?: number } = {}): Promise<ConversationListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("tutor_conversations")
    .select(CONVERSATION_COLUMNS)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(filters.limit ?? 50);
  if (filters.materialId) query = query.eq("material_id", filters.materialId);
  const { data, error } = await query;
  if (error) {
    console.error("tutor_conversations: list failed", error.message);
    return [];
  }
  return (data ?? []) as unknown as ConversationListItem[];
}

/** One page of the AI Tutor page, latest message first (the id breaks ties, so pages never overlap). */
export async function listConversationsPage(page: number, pageSize: number): Promise<Page<ConversationListItem>> {
  const supabase = await createClient();
  return fetchPage<ConversationListItem>(
    "tutor_conversations",
    (head) =>
      supabase
        .from("tutor_conversations")
        .select(head ? "id" : CONVERSATION_COLUMNS, { count: "exact", head })
        .is("archived_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("id"),
    page,
    pageSize,
  );
}

export type MessageView = Pick<TutorMessage, "id" | "role" | "content" | "action" | "selection" | "grounding" | "additional_explanation" | "created_at"> & {
  sources: TutorSource[];
  follow_ups: FollowUpId[];
  flashcard: FlashcardDraft | null;
  visual: Visual | null;
};

export type ConversationDetail = TutorConversation & {
  material: { id: string; title: string; status: string } | null;
  session: { id: string; status: string; title: string } | null;
  messages: MessageView[];
};

export const getConversation = cache(async (conversationId: string): Promise<ConversationDetail | null> => {
  const supabase = await createClient();
  const [{ data: conversation, error }, { data: messages }] = await Promise.all([
    supabase
      .from("tutor_conversations")
      .select("*, material:materials!tutor_conversations_material_fk(id, title, status), session:study_sessions!tutor_conversations_session_fk(id, status, title)")
      .eq("id", conversationId)
      .maybeSingle(),
    supabase
      .from("tutor_messages")
      .select("id, role, content, action, selection, grounding, sources, additional_explanation, follow_ups, flashcard, visual, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at")
      .limit(400),
  ]);
  if (error) {
    console.error("tutor_conversations: get failed", error.message);
    return null;
  }
  if (!conversation) return null;
  return {
    ...(conversation as unknown as Omit<ConversationDetail, "messages">),
    messages: (messages ?? []).map((message) => ({
      ...message,
      sources: Array.isArray(message.sources) ? (message.sources as unknown as TutorSource[]) : [],
      follow_ups: Array.isArray(message.follow_ups) ? (message.follow_ups as unknown as FollowUpId[]) : [],
      flashcard: (message.flashcard as unknown as FlashcardDraft | null) ?? null,
      visual: (message.visual as unknown as Visual | null) ?? null,
    })),
  };
});

export const countConversations = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase.from("tutor_conversations").select("id", { count: "exact", head: true }).is("archived_at", null);
  return count ?? 0;
});
