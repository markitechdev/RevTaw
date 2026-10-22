import "server-only";

import { isAiError } from "@/lib/ai";
import { ensureConcepts, normalizeConceptName } from "@/lib/concepts/service";
import type { StudentContext } from "@/lib/materials/analyze";
import { parsePreferences } from "@/lib/preferences/schema";
import { ServiceError } from "@/lib/reviewers/service";
import { completeSession, createSession, loadSession, SessionError, type SessionSummary } from "@/lib/study/sessions";
import type { Json, StudySession, TutorMode } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { evaluateTutorSession, TUTOR_HISTORY_TURNS, tutorReply, type TutorReply } from "@/lib/tutor/ai";
import { selectContext, type ContextChunk } from "@/lib/tutor/context";
import { flashcardDraftSchema, TUTOR_ACTION_BY_ID, type TutorActionId } from "@/lib/tutor/types";

type Client = Awaited<ReturnType<typeof createClient>>;

export { ServiceError, SessionError };

/** Turns of conversation sent with each message (Tamari's request budget). */
const HISTORY_LIMIT = TUTOR_HISTORY_TURNS;
/** About three of RevTaw's ~3,200-character chunks of the material per message. */
const TUTOR_CONTEXT_CHARS = 9_000;

async function studentContext(supabase: Client): Promise<StudentContext> {
  const { data: profile } = await supabase.from("profiles").select("education_level, main_goal, preferences").maybeSingle();
  return { educationLevel: profile?.education_level ?? null, mainGoal: profile?.main_goal ?? null, response: parsePreferences(profile?.preferences ?? {}).ai };
}

async function materialChunks(supabase: Client, materialId: string): Promise<{ title: string; chunks: ContextChunk[] }> {
  const [{ data: material }, { data: chunks }] = await Promise.all([
    supabase.from("materials").select("id, title, status").eq("id", materialId).maybeSingle(),
    supabase.from("material_chunks").select("id, position, heading, page_start, page_end, content").eq("material_id", materialId).order("position"),
  ]);
  if (!material) throw new ServiceError("Material not found.", 404);
  return {
    title: material.title,
    chunks: (chunks ?? []).map((chunk) => ({
      id: chunk.id,
      position: chunk.position,
      heading: chunk.heading,
      pageStart: chunk.page_start,
      pageEnd: chunk.page_end,
      content: chunk.content,
    })),
  };
}

export async function createConversation(input: { materialId: string | null; mode: TutorMode; title?: string | null; sessionId?: string | null }): Promise<{ id: string }> {
  const supabase = await createClient();
  let title = input.title?.trim() || null;
  if (input.materialId) {
    const { data: material } = await supabase.from("materials").select("title").eq("id", input.materialId).maybeSingle();
    if (!material) throw new ServiceError("Material not found.", 404);
    title = title ?? `${material.title} — Tutor`;
  }
  const { data, error } = await supabase
    .from("tutor_conversations")
    .insert({ material_id: input.materialId, mode: input.mode, title: (title ?? "New conversation").slice(0, 160), session_id: input.sessionId ?? null })
    .select("id")
    .single();
  if (error || !data) throw new Error(`tutor_conversations: insert failed: ${error?.message}`);
  return { id: data.id };
}

/** The student's latest free conversation on a material (not a study session), so highlight-and-ask builds one thread per material. */
export async function latestMaterialConversation(materialId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tutor_conversations")
    .select("id")
    .eq("material_id", materialId)
    .in("mode", ["tutor", "guided"])
    .is("session_id", null)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export type ConversationHeader = { id: string; title: string; material: { id: string; title: string } | null };

/** What Ask RevTaw shows above a chat: its title and the material its answers come from. */
export async function conversationHeader(conversationId: string): Promise<ConversationHeader | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tutor_conversations")
    .select("id, title, material:materials!tutor_conversations_material_fk(id, title)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, title: data.title, material: (data.material as unknown as { id: string; title: string } | null) ?? null };
}

export type SentMessage = {
  userMessageId: string | null;
  assistantMessageId: string;
  reply: TutorReply;
};

type ConversationRow = { id: string; user_id: string; material_id: string | null; mode: TutorMode; title: string; message_count: number };

async function loadConversation(supabase: Client, conversationId: string): Promise<ConversationRow> {
  const { data } = await supabase.from("tutor_conversations").select("id, user_id, material_id, mode, title, message_count").eq("id", conversationId).maybeSingle();
  if (!data) throw new ServiceError("Conversation not found.", 404);
  return data;
}

/**
 * Produces one assistant turn for a conversation: builds the grounded context,
 * asks the model and stores the reply with its sources. `storeUser` controls
 * whether the student's message is saved too (false for tutor openers).
 */
async function respond(
  supabase: Client,
  conversation: ConversationRow,
  input: { content: string; action: TutorActionId | null; selection: string | null; storeUser: boolean; pageNote?: string | null },
): Promise<SentMessage> {
  const [{ data: historyRows }, student, material] = await Promise.all([
    supabase
      .from("tutor_messages")
      .select("role, content, selection")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    studentContext(supabase),
    conversation.material_id ? materialChunks(supabase, conversation.material_id) : Promise.resolve(null),
  ]);
  const history = (historyRows ?? [])
    .reverse()
    .map((row) => ({ role: row.role as "user" | "assistant", content: row.role === "user" && row.selection ? `[Selected: "${row.selection.slice(0, 300)}"] ${row.content}` : row.content }));

  let userMessageId: string | null = null;
  if (input.storeUser) {
    const { data: userMessage, error: userError } = await supabase
      .from("tutor_messages")
      .insert({ conversation_id: conversation.id, user_id: conversation.user_id, role: "user", content: input.content.slice(0, 16000), action: input.action, selection: input.selection?.slice(0, 4000) ?? null })
      .select("id")
      .single();
    if (userError || !userMessage) throw new Error(`tutor_messages: insert failed: ${userError?.message}`);
    userMessageId = userMessage.id;
  }

  const context = material ? selectContext(material.chunks, input.content, input.selection, TUTOR_CONTEXT_CHARS) : { chunks: [], totalChunks: 0, truncated: false };
  let reply: TutorReply;
  let provider: string | null = null;
  let model: string | null = null;
  try {
    const result = await tutorReply({
      mode: conversation.mode,
      materialTitle: material?.title ?? null,
      context: context.chunks,
      truncated: context.truncated,
      history,
      message: input.content,
      action: input.action,
      selection: input.selection,
      student,
      pageNote: input.pageNote ?? null,
    });
    reply = result.reply;
    provider = result.provider;
    model = result.model;
  } catch (error) {
    if (!isAiError(error)) throw error;
    reply = {
      // A reached daily limit says when it refills; "try again in a moment" would mislead.
      answer: error.code === "quota_exceeded" ? `${error.message} Your question is saved.` : `${error.message} Your question is saved — try again in a moment.`,
      grounding: "general",
      sources: [],
      additional_explanation: null,
      follow_ups: [],
      flashcard: null,
      visual: null,
    };
  }

  // Keep only sources that point at passages we actually sent.
  const known = new Map(context.chunks.map((chunk) => [chunk.position, chunk]));
  const sources = reply.sources
    .filter((source) => known.has(source.position))
    .map((source) => {
      const chunk = known.get(source.position)!;
      return {
        position: source.position,
        heading: source.heading ?? chunk.heading,
        pages: source.pages ?? (chunk.pageStart ? (chunk.pageEnd && chunk.pageEnd !== chunk.pageStart ? `${chunk.pageStart}-${chunk.pageEnd}` : String(chunk.pageStart)) : null),
        quote: source.quote.slice(0, 400),
      };
    });

  const { data: assistantMessage, error: assistantError } = await supabase
    .from("tutor_messages")
    .insert({
      conversation_id: conversation.id,
      user_id: conversation.user_id,
      role: "assistant",
      content: reply.answer.slice(0, 16000),
      grounding: material ? reply.grounding : "general",
      sources: sources as unknown as Json,
      additional_explanation: reply.additional_explanation,
      follow_ups: reply.follow_ups as unknown as Json,
      flashcard: reply.flashcard as unknown as Json | null,
      visual: (reply.visual ?? null) as unknown as Json | null,
      provider,
      model,
    })
    .select("id")
    .single();
  if (assistantError || !assistantMessage) throw new Error(`tutor_messages: insert failed: ${assistantError?.message}`);

  const now = new Date().toISOString();
  await supabase
    .from("tutor_conversations")
    .update({
      message_count: conversation.message_count + (input.storeUser ? 2 : 1),
      last_message_at: now,
      // The first question names a conversation that has no material.
      ...(conversation.message_count === 0 && !conversation.material_id && input.storeUser ? { title: input.content.slice(0, 80) } : {}),
    })
    .eq("id", conversation.id);

  return { userMessageId, assistantMessageId: assistantMessage.id, reply: { ...reply, sources } };
}

/** Stores the student's message and the tutor's grounded reply. `pageNote` describes the page Ask RevTaw was opened on. */
export async function sendMessage(input: { conversationId: string; content: string; action: TutorActionId | null; selection: string | null; pageNote?: string | null }): Promise<SentMessage> {
  const supabase = await createClient();
  const conversation = await loadConversation(supabase, input.conversationId);
  const content = input.content.trim() || (input.action ? TUTOR_ACTION_BY_ID[input.action].prompt : "");
  if (!content) throw new ServiceError("Type a question or pick an action.", 400);
  return respond(supabase, conversation, { content, action: input.action, selection: input.selection, storeUser: true, pageNote: input.pageNote ?? null });
}

/** "Add to notes": appends the answer as a section of the material's tutor-notes reviewer (created on demand). */
export async function addMessageToNotes(messageId: string): Promise<{ reviewerId: string }> {
  const supabase = await createClient();
  const { data: message } = await supabase
    .from("tutor_messages")
    .select("id, user_id, content, role, conversation:tutor_conversations!tutor_messages_conversation_fk(id, material_id, title)")
    .eq("id", messageId)
    .maybeSingle();
  if (!message || message.role !== "assistant") throw new ServiceError("Only tutor answers can be added to notes.", 400);
  const conversation = message.conversation as unknown as { id: string; material_id: string | null; title: string } | null;
  if (!conversation?.material_id) throw new ServiceError("Notes need a material. Start the conversation from a material to save answers.", 400);

  const { data: previous } = await supabase
    .from("tutor_messages")
    .select("content, selection")
    .eq("conversation_id", conversation.id)
    .eq("role", "user")
    .lt("created_at", (await supabase.from("tutor_messages").select("created_at").eq("id", message.id).single()).data?.created_at ?? new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let { data: reviewer } = await supabase
    .from("reviewers")
    .select("id")
    .eq("material_id", conversation.material_id)
    .eq("kind", "bullet_notes")
    .ilike("title", "Tutor notes%")
    .is("archived_at", null)
    .maybeSingle();
  if (!reviewer) {
    const { data: material } = await supabase.from("materials").select("title").eq("id", conversation.material_id).maybeSingle();
    const { data: created, error } = await supabase
      .from("reviewers")
      .insert({ user_id: message.user_id, material_id: conversation.material_id, kind: "bullet_notes", title: `Tutor notes — ${material?.title ?? "material"}`.slice(0, 160), status: "ready", provider: "tutor" })
      .select("id")
      .single();
    if (error || !created) throw new Error(`reviewers: insert failed: ${error?.message}`);
    reviewer = created;
  }
  const { count } = await supabase.from("reviewer_sections").select("id", { count: "exact", head: true }).eq("reviewer_id", reviewer.id);
  const heading = (previous?.selection ?? previous?.content ?? "Tutor answer").replace(/\s+/g, " ").slice(0, 200);
  const { error } = await supabase.from("reviewer_sections").insert({
    reviewer_id: reviewer.id,
    user_id: message.user_id,
    position: count ?? 0,
    heading,
    content: message.content.slice(0, 20000),
  });
  if (error) throw new Error(`reviewer_sections: insert failed: ${error.message}`);
  return { reviewerId: reviewer.id };
}

/** "Create flashcard": saves the tutor's proposed card into the material's tutor deck (created on demand). */
export async function createFlashcardFromMessage(messageId: string, draft: { front: string; back: string }): Promise<{ deckId: string }> {
  const supabase = await createClient();
  const parsed = flashcardDraftSchema.safeParse(draft);
  if (!parsed.success) throw new ServiceError("The card needs a front and a back.", 400);
  const { data: message } = await supabase
    .from("tutor_messages")
    .select("id, user_id, conversation:tutor_conversations!tutor_messages_conversation_fk(material_id, title)")
    .eq("id", messageId)
    .maybeSingle();
  if (!message) throw new ServiceError("Message not found.", 404);
  const conversation = message.conversation as unknown as { material_id: string | null; title: string } | null;
  if (!conversation?.material_id) throw new ServiceError("Flashcards need a material. Start the conversation from a material to save cards.", 400);

  let { data: deck } = await supabase
    .from("flashcard_decks")
    .select("id, card_count")
    .eq("material_id", conversation.material_id)
    .ilike("title", "Tutor cards%")
    .is("archived_at", null)
    .maybeSingle();
  if (!deck) {
    const { data: material } = await supabase.from("materials").select("title").eq("id", conversation.material_id).maybeSingle();
    const { data: created, error } = await supabase
      .from("flashcard_decks")
      .insert({ user_id: message.user_id, material_id: conversation.material_id, title: `Tutor cards — ${material?.title ?? "material"}`.slice(0, 160), status: "ready", provider: "tutor" })
      .select("id, card_count")
      .single();
    if (error || !created) throw new Error(`flashcard_decks: insert failed: ${error?.message}`);
    deck = created;
  }
  const { count } = await supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("deck_id", deck.id);
  const concepts = await ensureConcepts(supabase, message.user_id, [parsed.data.front.slice(0, 60)], { materialId: conversation.material_id, subjectId: null });
  const { error } = await supabase.from("flashcards").insert({
    deck_id: deck.id,
    user_id: message.user_id,
    position: count ?? 0,
    front: parsed.data.front,
    back: parsed.data.back,
    concept_id: concepts.get(normalizeConceptName(parsed.data.front.slice(0, 60))) ?? null,
  });
  if (error) throw new Error(`flashcards: insert failed: ${error.message}`);
  await supabase.from("flashcard_decks").update({ card_count: (count ?? 0) + 1 }).eq("id", deck.id);
  return { deckId: deck.id };
}

// ---------------------------------------------------------------------------
// Tutor-based study sessions (Socratic questioning, elaborative interrogation, self-explanation)
// ---------------------------------------------------------------------------

const SESSION_MODE: Record<string, TutorMode> = {
  socratic_questioning: "socratic",
  elaborative_interrogation: "elaborative",
  self_explanation: "self_explanation",
  teach_back: "teach_back",
};

const SESSION_TITLE: Record<TutorMode, string> = {
  tutor: "Tutor",
  guided: "Guided",
  socratic: "Socratic Questioning",
  elaborative: "Elaborative Interrogation",
  self_explanation: "Self-Explanation",
  teach_back: "Teach-Back",
};

const OPENERS: Record<TutorMode, string> = {
  tutor: "Hello! Ask me anything about this material.",
  guided: "I will guide you with hints instead of answers. What are you working on?",
  socratic: "Start this Socratic session by asking the student one probing question about the most important idea in the material, and briefly say what you are doing.",
  elaborative: "Start this elaborative interrogation by stating one key claim from the material and asking the student why it is true.",
  self_explanation: "Start this self-explanation session: pick a worked example, procedure or multi-step idea from the material, present its first step, and ask the student to explain why that step works or what comes next.",
  teach_back: "Start this teach-back session as the learner: name the most important concept in the material, say you have never heard of it, and ask the student to teach it to you from the beginning.",
};

export async function startTutorSession(userId: string, input: { method: keyof typeof SESSION_MODE; materialId: string; goal: StudySession["goal"]; plannedMinutes: number; materialTitle: string }): Promise<{ sessionId: string; conversationId: string }> {
  const supabase = await createClient();
  const mode = SESSION_MODE[input.method];
  const { id: sessionId } = await createSession(supabase, userId, {
    method: input.method as "socratic_questioning",
    materialId: input.materialId,
    goal: input.goal,
    plannedMinutes: input.plannedMinutes,
    title: `${input.materialTitle} — ${SESSION_TITLE[mode]}`,
    state: { mode },
  });
  const { id: conversationId } = await createConversation({ materialId: input.materialId, mode, sessionId, title: `${input.materialTitle} — ${mode === "socratic" ? "Socratic" : mode === "elaborative" ? "Why chain" : mode === "teach_back" ? "Teach-back" : "Self-explanation"} session` });
  await supabase.from("study_sessions").update({ state: { mode, conversationId } as Json }).eq("id", sessionId);
  // The tutor opens the session so the student is not staring at an empty box.
  const conversation = await loadConversation(supabase, conversationId);
  await respond(supabase, conversation, { content: OPENERS[mode], action: null, selection: null, storeUser: false }).catch((error) => console.warn("tutor: opener failed", error));
  return { sessionId, conversationId };
}

/** Ends a tutor-based session: the model evaluates the student's reasoning and the §29 summary is stored. */
export async function completeTutorSession(sessionId: string): Promise<SessionSummary> {
  const supabase = await createClient();
  const session = await loadSession(supabase, sessionId);
  const state = session.state as { mode?: TutorMode; conversationId?: string } | null;
  if (!state?.conversationId) throw new SessionError("This session has no conversation.", 400);
  const { data: rows } = await supabase.from("tutor_messages").select("role, content").eq("conversation_id", state.conversationId).order("created_at").limit(60);
  const history = (rows ?? []).map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));
  const studentTurns = history.filter((turn) => turn.role === "user").length;

  let evaluation = { score: 0, strengths: [] as string[], missing_concepts: [] as string[], suggestion: "Answer the tutor's questions in your own words next time; the evaluation needs your reasoning.", concepts_covered: [] as string[] };
  if (studentTurns > 0) {
    try {
      const { data: material } = session.material_id ? await supabase.from("materials").select("title").eq("id", session.material_id).maybeSingle() : { data: null };
      evaluation = (await evaluateTutorSession({ mode: state.mode ?? "socratic", materialTitle: material?.title ?? null, history })).evaluation;
    } catch (error) {
      if (!isAiError(error)) throw error;
      evaluation.suggestion = "The AI coach was unavailable for the evaluation; re-read the conversation and note what you could not answer.";
    }
  }
  const accuracyItems = Math.max(studentTurns, 1);
  const correct = Math.round((evaluation.score / 100) * accuracyItems);
  return completeSession(supabase, sessionId, {
    topics: evaluation.concepts_covered,
    questionsAnswered: studentTurns,
    correct: studentTurns > 0 ? correct : 0,
    incorrect: studentTurns > 0 ? accuracyItems - correct : 0,
    weakConcepts: evaluation.missing_concepts.slice(0, 20),
    strongConcepts: evaluation.strengths.slice(0, 20),
    suggestedNext: evaluation.suggestion,
    nextReviewAt: null,
    extra: { score: evaluation.score, conversationId: state.conversationId },
    abandoned: studentTurns === 0,
  });
}
