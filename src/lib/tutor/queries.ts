import "server-only";

import { cache } from "react";

import type { TutorConversation, TutorMessage } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { FlashcardDraft, FollowUpId, TutorSource } from "@/lib/tutor/types";

export type ConversationListItem = Pick<TutorConversation, "id" | "material_id" | "session_id" | "title" | "mode" | "message_count" | "last_message_at" | "created_at"> & {
  material: { id: string; title: string } | null;
};

export async function listConversations(filters: { materialId?: string; limit?: number } = {}): Promise<ConversationListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("tutor_conversations")
    .select("id, material_id, session_id, title, mode, message_count, last_message_at, created_at, material:materials!tutor_conversations_material_fk(id, title)")
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

export type MessageView = Pick<TutorMessage, "id" | "role" | "content" | "action" | "selection" | "grounding" | "additional_explanation" | "created_at"> & {
  sources: TutorSource[];
  follow_ups: FollowUpId[];
  flashcard: FlashcardDraft | null;
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
      .select("id, role, content, action, selection, grounding, sources, additional_explanation, follow_ups, flashcard, created_at")
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
    })),
  };
});

export const countConversations = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase.from("tutor_conversations").select("id", { count: "exact", head: true }).is("archived_at", null);
  return count ?? 0;
});
