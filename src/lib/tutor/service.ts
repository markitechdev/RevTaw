import "server-only";

import { unstable_rethrow } from "next/navigation";

import { getMasterySummary } from "@/lib/adaptive/engine";
import { studySnapshot } from "@/lib/assistant/snapshot";
import { isAiError } from "@/lib/ai";
import type { AiError } from "@/lib/ai/errors";
import { track } from "@/lib/analytics/server";
import { ensureConcepts, normalizeConceptName } from "@/lib/concepts/service";
import { ServiceError } from "@/lib/errors";
import { parsePreferences } from "@/lib/preferences/schema";
import { completeSession, createSession, loadSession, SessionError, type SessionSummary } from "@/lib/study/sessions";
import type { Json, StudySession, TutorMode } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { evaluateTutorSession, tutorReply, type TutorEvaluation, type TutorReply } from "@/lib/tutor/ai";
import { rankMaterialChunks } from "@/lib/search/hybrid";
import { asksAboutNotes, excerpt, labelChunk, retrievalQuery, searchableQuestion, selectContext, sharesTopic, topicWords, type ContextChunk } from "@/lib/tutor/context";
import { TUTOR_HISTORY_MESSAGES, type TutorFocus, type TutorStudent, type WeakSpot } from "@/lib/tutor/prompt";
import { finalizeReply, type FinalReply } from "@/lib/tutor/reply";
import { flashcardDraftSchema } from "@/lib/tutor/schemas";
import { TUTOR_ACTION_BY_ID, type TutorActionId } from "@/lib/tutor/types";
import { clampTitle, titleWithSuffix } from "@/lib/text/clamp";

type Client = Awaited<ReturnType<typeof createClient>>;


/** Messages of the conversation read for each reply (the prompt keeps the newest that fit its budget). */
const HISTORY_LIMIT = TUTOR_HISTORY_MESSAGES;
/** About two and a half of RevTaw's ~3,200-character chunks of the material per message. */
const TUTOR_CONTEXT_CHARS = 8_000;
/**
 * A chat without a material searches all of the student's materials: up to four passages, each cut to the
 * part about the question, the best match first with the most room, so a first question still fits Groq's
 * free per-minute allowance (tested in ai.test.ts). A passage that would get less than the minimum isn't sent.
 */
const NOTES_CONTEXT_CHARS = 5_000;
const NOTES_PASSAGE_CHARS = 1_800;
const NOTES_MIN_PASSAGE_CHARS = 400;
const NOTES_PASSAGES = 4;

/**
 * Who Tamari is talking to: only the first name (as Home greets them), their level and goal, the answer
 * settings, and — in a chat about a material — the concepts of it they have been getting wrong.
 */
async function studentContext(supabase: Client, materialId: string | null): Promise<TutorStudent> {
  const [{ data: profile }, weakSpots] = await Promise.all([
    supabase.from("profiles").select("display_name, education_level, main_goal, preferences").maybeSingle(),
    materialWeakSpots(materialId),
  ]);
  return {
    firstName: profile?.display_name?.trim().split(/\s+/)[0] || null,
    educationLevel: profile?.education_level ?? null,
    mainGoal: profile?.main_goal ?? null,
    response: parsePreferences(profile?.preferences ?? {}).ai,
    weakSpots,
  };
}

/** Up to four concepts of the material the student needs work on, weakest signal first; none when unknown. */
async function materialWeakSpots(materialId: string | null): Promise<WeakSpot[]> {
  if (!materialId) return [];
  try {
    const summary = await getMasterySummary({ materialId });
    const spots: WeakSpot[] = [];
    for (const row of [...summary.needsWork, ...summary.misconceptions, ...summary.learning]) {
      const name = row.concept?.name;
      if (name && !spots.some((spot) => spot.name === name)) spots.push({ name, mastery: Number(row.mastery) });
      if (spots.length >= 4) break;
    }
    return spots;
  } catch (error) {
    unstable_rethrow(error);
    console.error("tutor: weak spots failed", error);
    return [];
  }
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

/**
 * For a chat without a material: the passages of the student's own materials (their session, so RLS keeps
 * them to their own) that best match the question, best first, numbered for citing. A passage must share a
 * topic word with the question (or its heading or material title must), so a question their notes don't
 * cover doesn't carry unrelated passages; when the student asks about their notes (`aboutNotes`), the best
 * matches count anyway. Materials in the Archive are left out. Empty when nothing matches or search is
 * unavailable.
 */
async function notesPassages(supabase: Client, query: string, selection: string | null, aboutNotes: boolean): Promise<ContextChunk[]> {
  const ranked = await rankMaterialChunks(supabase, { materialId: null, query, selection, limit: 10 });
  if (!ranked || ranked.ids.length === 0) return [];
  const terms = topicWords(`${query} ${selection ?? ""}`);
  const { data } = await supabase
    .from("material_chunks")
    .select("id, material_id, position, heading, page_start, page_end, content, material:materials!material_chunks_material_fk(title, archived_at)")
    .in("id", ranked.ids);
  const rows = new Map((data ?? []).map((row) => [row.id, row]));
  const passages: ContextChunk[] = [];
  let used = 0;
  for (const id of ranked.ids) {
    const room = Math.min(NOTES_PASSAGE_CHARS, NOTES_CONTEXT_CHARS - used);
    if (room < NOTES_MIN_PASSAGE_CHARS || passages.length >= NOTES_PASSAGES) break;
    const row = rows.get(id);
    const material = row?.material as { title: string; archived_at: string | null } | null | undefined;
    if (!row || !material || material.archived_at) continue;
    if (!aboutNotes && !sharesTopic(terms, `${material.title}\n${row.heading ?? ""}\n${row.content}`)) continue;
    const content = excerpt(row.content, `${query} ${selection ?? ""}`, room);
    passages.push({
      id: row.id,
      position: row.position,
      heading: row.heading,
      pageStart: row.page_start,
      pageEnd: row.page_end,
      content,
      materialId: row.material_id,
      materialTitle: material.title,
      ref: passages.length + 1,
    });
    used += content.length;
  }
  return passages;
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
    .insert({ material_id: input.materialId, mode: input.mode, title: clampTitle(title ?? "New conversation"), session_id: input.sessionId ?? null })
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
  reply: FinalReply<TutorReply["visual"]>;
};

type ConversationRow = { id: string; user_id: string; material_id: string | null; session_id: string | null; mode: TutorMode; title: string; message_count: number };

async function loadConversation(supabase: Client, conversationId: string): Promise<ConversationRow> {
  const { data } = await supabase.from("tutor_conversations").select("id, user_id, material_id, session_id, mode, title, message_count").eq("id", conversationId).maybeSingle();
  if (!data) throw new ServiceError("Conversation not found.", 404);
  return data;
}

/** A study session's chat is read-only once the session has ended (its summary is already written). */
async function assertOpen(supabase: Client, conversation: ConversationRow): Promise<void> {
  if (!conversation.session_id) return;
  const { data: session } = await supabase.from("study_sessions").select("status").eq("id", conversation.session_id).maybeSingle();
  if (session && session.status !== "in_progress") throw new ServiceError("This session has ended. Start a new one from the Study page to continue.", 409);
}

/** What the student reads when Tamari could not answer: plain words, never a technical error. */
export function tutorErrorMessage(error: AiError): string {
  switch (error.code) {
    // A reached daily limit says when it refills; "try again in a moment" would mislead.
    case "quota_exceeded":
      return error.message;
    case "not_configured":
      return "Tamari isn't set up on this server yet.";
    case "content_too_large":
      return "That's too much for Tamari in one go. Ask about a smaller part, or highlight less text.";
    case "invalid_output":
      return "Tamari's answer came out garbled. Your question is saved — press Try again.";
    default:
      return "Tamari is busy right now. Your question is saved — press Try again.";
  }
}

/**
 * The AI could not answer. Nothing is saved as Tamari's reply (an error is not an answer, and it would be read
 * back as one in the next turn); the student's question stays saved, so "Try again" answers it as it is.
 */
export class TutorUnavailableError extends ServiceError {
  constructor(
    message: string,
    status: number,
    readonly userMessageId: string | null,
    readonly retryAfterSeconds?: number,
  ) {
    super(message, status);
    this.name = "TutorUnavailableError";
  }
}

type HistoryRow = { id: string; role: string; content: string; selection: string | null; created_at: string };

/** A student message as the model sees it: with the text they highlighted, when there was one. */
function asked(row: { content: string; selection: string | null }): string {
  return row.selection ? `[Selected: "${row.selection.slice(0, 300)}"] ${row.content}` : row.content;
}

/**
 * The earlier answer a follow-up is about: the one the student clicked under (`replyTo`), or, for a quick
 * action with nothing typed or highlighted, the latest answer. With its question, so "it" has a referent.
 */
async function resolveFocus(
  supabase: Client,
  conversationId: string,
  rows: HistoryRow[],
  input: { replyTo?: string | null; action: TutorActionId | null; typed: boolean; selection: string | null },
): Promise<TutorFocus | null> {
  if (input.replyTo) {
    const { data: answer } = await supabase.from("tutor_messages").select("content, created_at").eq("id", input.replyTo).eq("conversation_id", conversationId).eq("role", "assistant").maybeSingle();
    if (answer) {
      const { data: question } = await supabase
        .from("tutor_messages")
        .select("content, selection")
        .eq("conversation_id", conversationId)
        .eq("role", "user")
        .lt("created_at", answer.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { question: question ? asked(question) : null, answer: answer.content };
    }
  }
  if (input.action && !input.typed && !input.selection) {
    // `rows` is newest first: the latest answer, then the question before it.
    const index = rows.findIndex((row) => row.role === "assistant");
    if (index >= 0) {
      const question = rows.slice(index + 1).find((row) => row.role === "user");
      return { question: question ? asked(question) : null, answer: rows[index].content };
    }
  }
  return null;
}

/**
 * Produces one assistant turn for a conversation: builds the grounded context,
 * asks the model and stores the reply with its sources. `storeUser` controls
 * whether the student's message is saved too (false for tutor openers).
 */
async function respond(
  supabase: Client,
  conversation: ConversationRow,
  input: {
    content: string;
    action: TutorActionId | null;
    selection: string | null;
    storeUser: boolean;
    pageNote?: string | null;
    replyTo?: string | null;
    typed?: boolean;
    /** Answering a saved question again: the history is what came before it, and its id is the reply's question. */
    answering?: { id: string; createdAt: string } | null;
    /** The answer the student asked to replace ("Answer again"). */
    previousAttempt?: string | null;
  },
): Promise<SentMessage> {
  let historyQuery = supabase
    .from("tutor_messages")
    .select("id, role, content, selection, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (input.answering) historyQuery = historyQuery.lt("created_at", input.answering.createdAt);
  const [{ data: historyData }, student, material, studyStatus] = await Promise.all([
    historyQuery,
    studentContext(supabase, conversation.material_id),
    conversation.material_id ? materialChunks(supabase, conversation.material_id) : Promise.resolve(null),
    // Where the student stands, with every question: Tamari uses it only when it helps (prompt rule 10).
    studySnapshot(),
  ]);
  const rows = (historyData ?? []) as HistoryRow[];
  const focus = await resolveFocus(supabase, conversation.id, rows, { replyTo: input.replyTo, action: input.action, typed: input.typed ?? true, selection: input.selection });
  const lastQuestion = rows.find((row) => row.role === "user");
  const query = retrievalQuery(input.content, focus, lastQuestion ? asked(lastQuestion) : null);
  // Tamari's search: the passages that best match the question (null → keyword scoring). Without a material,
  // a question (not small talk) searches all of the student's materials.
  const ranked = conversation.material_id ? await rankMaterialChunks(supabase, { materialId: conversation.material_id, query, selection: input.selection }) : null;
  const searched = !conversation.material_id && searchableQuestion(`${input.content} ${input.selection ?? ""}`);
  const aboutNotes = asksAboutNotes(input.content);
  const notes = searched ? await notesPassages(supabase, query, input.selection, aboutNotes) : [];
  const history = [...rows].reverse().map((row) => ({ role: row.role as "user" | "assistant", content: row.role === "user" ? asked(row) : row.content }));

  let userMessageId: string | null = input.answering?.id ?? null;
  if (input.storeUser) {
    const { data: userMessage, error: userError } = await supabase
      .from("tutor_messages")
      .insert({ conversation_id: conversation.id, user_id: conversation.user_id, role: "user", content: input.content.slice(0, 16000), action: input.action, selection: input.selection?.slice(0, 4000) ?? null })
      .select("id")
      .single();
    if (userError || !userMessage) throw new Error(`tutor_messages: insert failed: ${userError?.message}`);
    userMessageId = userMessage.id;
  }

  const context = material
    ? selectContext(material.chunks, query, input.selection, TUTOR_CONTEXT_CHARS, ranked?.ids ?? null)
    : { chunks: notes, totalChunks: notes.length, truncated: false };
  let reply: TutorReply;
  let provider: string | null = null;
  let model: string | null = null;
  try {
    const result = await tutorReply({
      mode: conversation.mode,
      materialTitle: material?.title ?? null,
      context: context.chunks,
      notes: searched,
      truncated: context.truncated,
      history,
      message: input.content,
      action: input.action,
      selection: input.selection,
      focus,
      student,
      pageNote: input.pageNote ?? null,
      studyStatus,
      previousAttempt: input.previousAttempt ?? null,
    });
    reply = result.reply;
    provider = result.provider;
    model = result.model;
  } catch (error) {
    if (!isAiError(error)) throw error;
    if (input.storeUser) await touchConversation(supabase, conversation, 1, input.content);
    throw new TutorUnavailableError(tutorErrorMessage(error), error.code === "quota_exceeded" || error.code === "rate_limited" ? 429 : 503, userMessageId, error.retryAfterSeconds);
  }

  // Honest labels and sources before anything is saved (small talk, no material, passages actually sent).
  const final = finalizeReply(reply, context.chunks, material ? "material" : searched ? "notes" : "none", { askedAboutNotes: aboutNotes });

  const { data: assistantMessage, error: assistantError } = await supabase
    .from("tutor_messages")
    .insert({
      conversation_id: conversation.id,
      user_id: conversation.user_id,
      role: "assistant",
      content: final.answer.slice(0, 16000),
      grounding: final.grounding,
      sources: final.sources as unknown as Json,
      additional_explanation: final.additional_explanation,
      follow_ups: final.follow_ups as unknown as Json,
      flashcard: final.flashcard as unknown as Json | null,
      visual: (final.visual ?? null) as unknown as Json | null,
      provider,
      model,
    })
    .select("id")
    .single();
  if (assistantError || !assistantMessage) throw new Error(`tutor_messages: insert failed: ${assistantError?.message}`);
  track(conversation.user_id, "tamari_message", { mode: conversation.mode, grounding: final.grounding ?? "conversation", provider: provider ?? "none" });

  await touchConversation(supabase, conversation, input.storeUser ? 2 : 1, input.storeUser ? input.content : null);

  return { userMessageId, assistantMessageId: assistantMessage.id, reply: final };
}

/** Counts new messages on the conversation and, for its first question without a material, names it. */
async function touchConversation(supabase: Client, conversation: ConversationRow, added: number, question: string | null): Promise<void> {
  await supabase
    .from("tutor_conversations")
    .update({
      message_count: Math.max(0, conversation.message_count + added),
      last_message_at: new Date().toISOString(),
      // The first question names a conversation that has no material.
      ...(conversation.message_count === 0 && !conversation.material_id && question ? { title: question.slice(0, 80) } : {}),
    })
    .eq("id", conversation.id);
}

/**
 * Answers the latest question again ("Try again" after a failure, or a new answer to replace the last one):
 * the reply after it, if any, is deleted, and the question is answered from the conversation before it.
 */
export async function regenerateReply(input: { conversationId: string; pageNote?: string | null }): Promise<SentMessage> {
  const supabase = await createClient();
  const conversation = await loadConversation(supabase, input.conversationId);
  await assertOpen(supabase, conversation);
  const { data: latest } = await supabase
    .from("tutor_messages")
    .select("id, role, content, action, selection, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(2);
  const rows = latest ?? [];
  const question = rows[0]?.role === "user" ? rows[0] : rows[1]?.role === "user" ? rows[1] : null;
  if (!question) throw new ServiceError("There is no question to answer again yet.", 409);
  let count = conversation.message_count;
  // "Answer again": the answer being replaced goes, and the new one is asked to take another angle.
  const previousAttempt = rows[0]?.role === "assistant" ? rows[0].content : null;
  if (rows[0]?.role === "assistant") {
    const { error } = await supabase.from("tutor_messages").delete().eq("id", rows[0].id);
    if (error) throw new Error(`tutor_messages: delete failed: ${error.message}`);
    count -= 1;
  }
  const action = (question.action as TutorActionId | null) ?? null;
  const typed = !(action && question.content === TUTOR_ACTION_BY_ID[action]?.prompt);
  return respond(supabase, { ...conversation, message_count: count }, {
    content: question.content,
    action,
    selection: question.selection,
    storeUser: false,
    typed,
    pageNote: input.pageNote ?? null,
    answering: { id: question.id, createdAt: question.created_at },
    previousAttempt,
  });
}

/**
 * Stores the student's message and the tutor's grounded reply. `pageNote` describes the page Ask RevTaw was
 * opened on; `replyTo` is the answer a follow-up button was pressed under.
 */
export async function sendMessage(input: {
  conversationId: string;
  content: string;
  action: TutorActionId | null;
  selection: string | null;
  pageNote?: string | null;
  replyTo?: string | null;
  /** "Edit": the edited question replaces the latest one and its answer. */
  replaceLast?: boolean;
}): Promise<SentMessage> {
  const supabase = await createClient();
  let conversation = await loadConversation(supabase, input.conversationId);
  await assertOpen(supabase, conversation);
  const typed = input.content.trim();
  const content = typed || (input.action ? TUTOR_ACTION_BY_ID[input.action].prompt : "");
  if (!content) throw new ServiceError("Type a question or pick an action.", 400);
  if (input.replaceLast) conversation = await removeLatestExchange(supabase, conversation);
  return respond(supabase, conversation, { content, action: input.action, selection: input.selection, storeUser: true, pageNote: input.pageNote ?? null, replyTo: input.replyTo ?? null, typed: Boolean(typed) });
}

/** Deletes the latest question and the answer after it (only those), so an edited question takes their place. */
async function removeLatestExchange(supabase: Client, conversation: ConversationRow): Promise<ConversationRow> {
  const { data: latest } = await supabase.from("tutor_messages").select("id, role, created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(2);
  const rows = latest ?? [];
  const question = rows[0]?.role === "user" ? rows[0] : rows[1]?.role === "user" ? rows[1] : null;
  if (!question) throw new ServiceError("There is no question to edit.", 409);
  const ids = rows[0].id === question.id ? [question.id] : [question.id, rows[0].id];
  const { error } = await supabase.from("tutor_messages").delete().in("id", ids);
  if (error) throw new Error(`tutor_messages: delete failed: ${error.message}`);
  return { ...conversation, message_count: Math.max(0, conversation.message_count - ids.length) };
}

/** "Add to notes": appends the answer as a section of the material's tutor-notes reviewer (created on demand). */
export async function addMessageToNotes(messageId: string): Promise<{ reviewerId: string }> {
  const supabase = await createClient();
  const { data: message } = await supabase
    .from("tutor_messages")
    .select("id, user_id, content, role, conversation:tutor_conversations!tutor_messages_conversation_fk(id, material_id, title)")
    .eq("id", messageId)
    .maybeSingle();
  if (!message || message.role !== "assistant") throw new ServiceError("Only Tamari's answers can be added to notes.", 400);
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

  const materialId = conversation.material_id;
  // The notes reviewer is the one Tamari made for this material (provider "tutor"), whatever the student renamed it to.
  const findNotes = () =>
    supabase.from("reviewers").select("id").eq("material_id", materialId).eq("kind", "bullet_notes").eq("provider", "tutor").order("created_at").order("id").limit(1).maybeSingle();
  const reviewer = await findOrCreateTutorRow(findNotes, async () => {
    const { data: material } = await supabase.from("materials").select("title").eq("id", materialId).maybeSingle();
    const { data: created, error } = await supabase
      .from("reviewers")
      .insert({ user_id: message.user_id, material_id: materialId, kind: "bullet_notes", title: clampTitle(`Tamari's notes — ${material?.title ?? "material"}`), status: "ready", provider: "tutor" })
      .select("id")
      .single();
    if (error || !created) throw new Error(`reviewers: insert failed: ${error?.message}`);
    return created;
  }, (id) => supabase.from("reviewers").delete().eq("id", id));
  const heading = (previous?.selection ?? previous?.content ?? "Tamari's answer").replace(/\s+/g, " ").slice(0, 200);
  await insertAtEnd(
    () => supabase.from("reviewer_sections").select("position").eq("reviewer_id", reviewer.id).order("position", { ascending: false }).limit(1).maybeSingle(),
    (position) => supabase.from("reviewer_sections").insert({ reviewer_id: reviewer.id, user_id: message.user_id, position, heading, content: message.content.slice(0, 20000) }),
    "reviewer_sections",
  );
  return { reviewerId: reviewer.id };
}

/**
 * Finds the material's tutor reviewer or deck, or makes it. Two saves at the same moment can both make
 * one; the oldest is kept and the other (still empty) is removed, so every save lands in the same place.
 */
async function findOrCreateTutorRow(
  find: () => PromiseLike<{ data: { id: string } | null }>,
  create: () => Promise<{ id: string }>,
  remove: (id: string) => PromiseLike<unknown>,
): Promise<{ id: string }> {
  const { data: existing } = await find();
  if (existing) return existing;
  const created = await create();
  const { data: kept } = await find();
  if (kept && kept.id !== created.id) {
    await remove(created.id);
    return kept;
  }
  return created;
}

/**
 * Inserts a row after the parent's last position. Positions can have gaps (a count would collide), and
 * when another save takes the same position at that moment the insert moves on to the next one.
 */
async function insertAtEnd(
  last: () => PromiseLike<{ data: { position: number } | null }>,
  insert: (position: number) => PromiseLike<{ error: { code?: string; message: string } | null }>,
  label: string,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    const { data } = await last();
    const { error } = await insert((data?.position ?? -1) + 1);
    if (!error) return;
    if (error.code !== "23505" || attempt >= 2) throw new Error(`${label}: insert failed: ${error.message}`);
  }
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

  const materialId = conversation.material_id;
  // The tutor deck is the one Tamari made for this material (provider "tutor"), whatever the student renamed it to.
  const findDeck = () => supabase.from("flashcard_decks").select("id").eq("material_id", materialId).eq("provider", "tutor").order("created_at").order("id").limit(1).maybeSingle();
  const deck = await findOrCreateTutorRow(findDeck, async () => {
    const { data: material } = await supabase.from("materials").select("title").eq("id", materialId).maybeSingle();
    const { data: created, error } = await supabase
      .from("flashcard_decks")
      .insert({ user_id: message.user_id, material_id: materialId, title: clampTitle(`Tamari's cards — ${material?.title ?? "material"}`), status: "ready", provider: "tutor" })
      .select("id")
      .single();
    if (error || !created) throw new Error(`flashcard_decks: insert failed: ${error?.message}`);
    return created;
  }, (id) => supabase.from("flashcard_decks").delete().eq("id", id));
  const concepts = await ensureConcepts(supabase, message.user_id, [parsed.data.front.slice(0, 60)], { materialId, subjectId: null });
  await insertAtEnd(
    () => supabase.from("flashcards").select("position").eq("deck_id", deck.id).order("position", { ascending: false }).limit(1).maybeSingle(),
    (position) =>
      supabase.from("flashcards").insert({
        deck_id: deck.id,
        user_id: message.user_id,
        position,
        front: parsed.data.front,
        back: parsed.data.back,
        concept_id: concepts.get(normalizeConceptName(parsed.data.front.slice(0, 60))) ?? null,
      }),
    "flashcards",
  );
  // The deck's count from its cards; a save that counted earlier never lowers it.
  const { count } = await supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("deck_id", deck.id);
  if (count !== null) await supabase.from("flashcard_decks").update({ card_count: count }).eq("id", deck.id).lt("card_count", count);
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
    title: titleWithSuffix(input.materialTitle, SESSION_TITLE[mode]),
    state: { mode },
  });
  const { id: conversationId } = await createConversation({ materialId: input.materialId, mode, sessionId, title: titleWithSuffix(input.materialTitle, `${mode === "socratic" ? "Socratic" : mode === "elaborative" ? "Why chain" : mode === "teach_back" ? "Teach-back" : "Self-explanation"} session`) });
  await supabase.from("study_sessions").update({ state: { mode, conversationId } as Json }).eq("id", sessionId);
  // The tutor opens the session so the student is not staring at an empty box.
  const conversation = await loadConversation(supabase, conversationId);
  await respond(supabase, conversation, { content: OPENERS[mode], action: null, selection: null, storeUser: false }).catch((error) => console.warn("tutor: opener failed", error));
  return { sessionId, conversationId };
}

/**
 * Ends a tutor-based session: the model evaluates the student's reasoning and the §29 summary is stored.
 * `stopped`: the student ended it from the list of unfinished sessions, so nothing is evaluated (no score
 * is made up), it counts the time up to the last message, and it is kept as stopped early.
 */
export async function completeTutorSession(sessionId: string, options: { stopped?: boolean } = {}): Promise<SessionSummary> {
  const supabase = await createClient();
  const session = await loadSession(supabase, sessionId);
  const state = session.state as { mode?: TutorMode; conversationId?: string } | null;
  if (!state?.conversationId) throw new SessionError("This session has no conversation.", 400);
  const { data: rows } = await supabase.from("tutor_messages").select("role, content, created_at").eq("conversation_id", state.conversationId).order("created_at").limit(60);
  const history = (rows ?? []).map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));
  const studentTurns = history.filter((turn) => turn.role === "user").length;

  if (options.stopped) {
    const last = rows?.at(-1)?.created_at;
    const span = last ? Math.round((new Date(last).getTime() - new Date(session.started_at).getTime()) / 1000) : 0;
    return completeSession(supabase, sessionId, {
      focusSeconds: Math.max(0, Math.min(span, 3 * 3600)),
      topics: [],
      questionsAnswered: 0,
      correct: 0,
      incorrect: 0,
      weakConcepts: [],
      strongConcepts: [],
      suggestedNext: "Ended before Tamari evaluated it. The conversation is still in Ask Tamari if you want to read it again.",
      nextReviewAt: null,
      extra: { conversationId: state.conversationId, studentTurns },
      abandoned: true,
    });
  }

  // The conversation is scored as a whole: its replies aren't graded one by one, so no right/wrong counts
  // are made up from the score. A session that couldn't be evaluated has no score (not 0).
  let evaluation: TutorEvaluation | null = null;
  let suggestion = "Answer Tamari's questions in your own words next time; the evaluation needs your reasoning.";
  if (studentTurns > 0) {
    try {
      const material = session.material_id ? await materialChunks(supabase, session.material_id).catch(() => null) : null;
      // The passages on what was discussed, so the reasoning is judged against the material.
      const discussed = history.map((turn) => turn.content).join("\n").slice(-6000);
      const passages = material && material.chunks.length ? selectContext(material.chunks, discussed, null, 9_000).chunks.map((chunk) => `${labelChunk(chunk)}\n${chunk.content}`).join("\n\n") : null;
      evaluation = (await evaluateTutorSession({ mode: state.mode ?? "socratic", materialTitle: material?.title ?? null, history, passages })).evaluation;
      suggestion = evaluation.suggestion;
    } catch (error) {
      if (!isAiError(error)) throw error;
      suggestion = "Tamari couldn't evaluate this session, so it has no score. Re-read the conversation and note what you couldn't answer.";
    }
  }
  return completeSession(supabase, sessionId, {
    topics: evaluation?.concepts_covered ?? [],
    questionsAnswered: 0,
    correct: 0,
    incorrect: 0,
    accuracy: evaluation ? evaluation.score / 100 : null,
    answersForXp: studentTurns,
    weakConcepts: (evaluation?.missing_concepts ?? []).slice(0, 20),
    strongConcepts: (evaluation?.strengths ?? []).slice(0, 20),
    suggestedNext: suggestion,
    nextReviewAt: null,
    extra: { ...(evaluation ? { score: evaluation.score } : {}), studentTurns, conversationId: state.conversationId },
    abandoned: studentTurns === 0,
  });
}
