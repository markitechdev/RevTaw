import "server-only";

import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Global search (spec §33): one query across documents, notes/reviewers,
 * topics, questions, flashcards and AI conversations. Full-text search
 * (English stemming, websearch syntax) through the signed-in client, so RLS
 * keeps it to the student's own rows; the hit's text is shown as a snippet
 * around the first matching word.
 */

export type SearchGroup = "materials" | "reviewers" | "topics" | "questions" | "flashcards" | "conversations";

export type SearchHit = {
  id: string;
  title: string;
  snippet: string | null;
  href: string;
  /** Where the hit lives (material title, deck, quiz…). */
  context: string | null;
};

export type SearchResults = { query: string; groups: Array<{ group: SearchGroup; label: string; hits: SearchHit[] }>; total: number };

export const SEARCH_GROUP_LABEL: Record<SearchGroup, string> = {
  materials: "Documents",
  reviewers: "Notes and reviewers",
  topics: "Topics",
  questions: "Questions",
  flashcards: "Flashcards",
  conversations: "AI conversations",
};

const PER_GROUP = 8;
const MAX_QUERY = 120;

/** Trims and normalizes the query; the websearch syntax handles quotes, OR and minus itself. */
export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
}

/** The words of the query (for snippets and highlighting), lower-cased, without operators. */
export function queryTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().replace(/["()]/g, " ").split(/\s+/).map((term) => term.replace(/^-/, "")).filter((term) => term.length >= 2 && term !== "or"))];
}

/** ~160 characters around the first term found (or the start of the text). */
export function snippetOf(text: string, terms: string[], width = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= width) return clean;
  const lower = clean.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const index = lower.indexOf(term);
    if (index !== -1 && (at === -1 || index < at)) at = index;
  }
  if (at === -1) return `${clean.slice(0, width - 1)}…`;
  const start = Math.max(0, at - Math.floor(width / 3));
  const end = Math.min(clean.length, start + width);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end).trim()}${end < clean.length ? "…" : ""}`;
}

type Client = Awaited<ReturnType<typeof createClient>>;

async function searchMaterials(supabase: Client, query: string, terms: string[]): Promise<SearchHit[]> {
  const [{ data: byTitle }, { data: chunks }] = await Promise.all([
    supabase.from("materials").select("id, title").is("archived_at", null).textSearch("title", query, { type: "websearch", config: "english" }).limit(PER_GROUP),
    supabase.from("material_chunks").select("material_id, heading, content, material:materials!material_chunks_material_fk(id, title, archived_at)").textSearch("content", query, { type: "websearch", config: "english" }).limit(PER_GROUP * 3),
  ]);
  const hits = new Map<string, SearchHit>();
  for (const material of byTitle ?? []) hits.set(material.id, { id: material.id, title: material.title, snippet: null, href: `${routes.materials}/${material.id}`, context: "Matches the title" });
  for (const chunk of chunks ?? []) {
    const material = chunk.material as unknown as { id: string; title: string; archived_at: string | null } | null;
    if (!material || material.archived_at || hits.has(material.id)) continue;
    hits.set(material.id, { id: material.id, title: material.title, snippet: snippetOf(chunk.content, terms), href: `${routes.materials}/${material.id}`, context: chunk.heading ? `In ${chunk.heading}` : null });
  }
  return [...hits.values()].slice(0, PER_GROUP);
}

async function searchReviewers(supabase: Client, query: string, terms: string[]): Promise<SearchHit[]> {
  const [{ data: byTitle }, { data: sections }] = await Promise.all([
    supabase.from("reviewers").select("id, title, kind").textSearch("title", query, { type: "websearch", config: "english" }).limit(PER_GROUP),
    supabase.from("reviewer_sections").select("reviewer_id, heading, content, reviewer:reviewers!reviewer_sections_reviewer_fk(id, title)").textSearch("search_text", query, { type: "websearch", config: "english" }).limit(PER_GROUP * 3),
  ]);
  const hits = new Map<string, SearchHit>();
  for (const reviewer of byTitle ?? []) hits.set(reviewer.id, { id: reviewer.id, title: reviewer.title, snippet: null, href: `${routes.notes}/${reviewer.id}`, context: "Matches the title" });
  for (const section of sections ?? []) {
    const reviewer = section.reviewer as unknown as { id: string; title: string } | null;
    if (!reviewer || hits.has(reviewer.id)) continue;
    hits.set(reviewer.id, { id: reviewer.id, title: reviewer.title, snippet: snippetOf(section.content, terms), href: `${routes.notes}/${reviewer.id}`, context: section.heading ? `In ${section.heading}` : null });
  }
  return [...hits.values()].slice(0, PER_GROUP);
}

async function searchTopics(supabase: Client, query: string): Promise<SearchHit[]> {
  const { data } = await supabase
    .from("concepts")
    .select("id, name, material:materials!concepts_material_fk(id, title), mastery:concept_mastery!concept_mastery_concept_fk(mastery, status)")
    .textSearch("name", query, { type: "websearch", config: "english" })
    .limit(PER_GROUP);
  return (data ?? []).map((concept) => {
    const material = concept.material as unknown as { id: string; title: string } | null;
    const mastery = (concept.mastery as unknown as Array<{ mastery: number; status: string }> | null)?.[0];
    return {
      id: concept.id,
      title: concept.name,
      snippet: mastery ? `Mastery ${Math.round(Number(mastery.mastery))}% · ${mastery.status}` : "Not practiced yet",
      href: `${routes.progress}/map`,
      context: material?.title ?? null,
    };
  });
}

async function searchQuestions(supabase: Client, query: string, terms: string[]): Promise<SearchHit[]> {
  const { data } = await supabase
    .from("quiz_questions")
    .select("id, prompt, quiz:quizzes!quiz_questions_quiz_fk(id, title)")
    .textSearch("prompt", query, { type: "websearch", config: "english" })
    .limit(PER_GROUP);
  return (data ?? []).flatMap((question) => {
    const quiz = question.quiz as unknown as { id: string; title: string } | null;
    if (!quiz) return [];
    return [{ id: question.id, title: snippetOf(question.prompt, terms, 140), snippet: null, href: `${routes.quiz}/${quiz.id}`, context: quiz.title }];
  });
}

async function searchFlashcards(supabase: Client, query: string, terms: string[]): Promise<SearchHit[]> {
  const { data } = await supabase
    .from("flashcards")
    .select("id, front, back, deck:flashcard_decks!flashcards_deck_fk(id, title)")
    .textSearch("search_text", query, { type: "websearch", config: "english" })
    .limit(PER_GROUP);
  return (data ?? []).flatMap((card) => {
    const deck = card.deck as unknown as { id: string; title: string } | null;
    if (!deck) return [];
    return [{ id: card.id, title: card.front, snippet: snippetOf(card.back, terms, 120), href: `${routes.flashcards}/${deck.id}`, context: deck.title }];
  });
}

async function searchConversations(supabase: Client, query: string, terms: string[]): Promise<SearchHit[]> {
  const [{ data: byTitle }, { data: messages }] = await Promise.all([
    supabase.from("tutor_conversations").select("id, title").textSearch("title", query, { type: "websearch", config: "english" }).limit(PER_GROUP),
    supabase.from("tutor_messages").select("conversation_id, content, role, conversation:tutor_conversations!tutor_messages_conversation_fk(id, title)").textSearch("content", query, { type: "websearch", config: "english" }).order("created_at", { ascending: false }).limit(PER_GROUP * 3),
  ]);
  const hits = new Map<string, SearchHit>();
  for (const conversation of byTitle ?? []) hits.set(conversation.id, { id: conversation.id, title: conversation.title, snippet: null, href: `${routes.tutor}/${conversation.id}`, context: "Matches the title" });
  for (const message of messages ?? []) {
    const conversation = message.conversation as unknown as { id: string; title: string } | null;
    if (!conversation || hits.has(conversation.id)) continue;
    hits.set(conversation.id, { id: conversation.id, title: conversation.title, snippet: snippetOf(message.content, terms), href: `${routes.tutor}/${conversation.id}`, context: message.role === "assistant" ? "Tamari said" : "You asked" });
  }
  return [...hits.values()].slice(0, PER_GROUP);
}

export async function globalSearch(raw: string): Promise<SearchResults> {
  const query = normalizeQuery(raw);
  if (!query) return { query, groups: [], total: 0 };
  const supabase = await createClient();
  const terms = queryTerms(query);
  const safe = async <T,>(run: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await run();
    } catch (error) {
      console.error("search: a group failed", error);
      return [];
    }
  };
  const [materials, reviewers, topics, questions, flashcards, conversations] = await Promise.all([
    safe(() => searchMaterials(supabase, query, terms)),
    safe(() => searchReviewers(supabase, query, terms)),
    safe(() => searchTopics(supabase, query)),
    safe(() => searchQuestions(supabase, query, terms)),
    safe(() => searchFlashcards(supabase, query, terms)),
    safe(() => searchConversations(supabase, query, terms)),
  ]);
  const groups: SearchResults["groups"] = (
    [
      ["materials", materials],
      ["reviewers", reviewers],
      ["topics", topics],
      ["questions", questions],
      ["flashcards", flashcards],
      ["conversations", conversations],
    ] as Array<[SearchGroup, SearchHit[]]>
  )
    .filter(([, hits]) => hits.length > 0)
    .map(([group, hits]) => ({ group, label: SEARCH_GROUP_LABEL[group], hits }));
  return { query, groups, total: groups.reduce((sum, group) => sum + group.hits.length, 0) };
}
