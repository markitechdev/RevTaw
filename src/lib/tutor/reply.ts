import type { ContextChunk } from "@/lib/tutor/context";
import type { FlashcardDraft, FollowUpId, TutorSource } from "@/lib/tutor/types";

/**
 * Checks a reply before it is saved and shown, so its labels say honestly where it came from:
 * small talk carries no source label, a chat with no passages never claims to use any, general knowledge
 * added to a material answer stays apart only when there is a material to tell it apart from, sources point
 * only at passages that were actually sent and quote them for real, and an answer with no real quote is not
 * labeled as coming from the material.
 *
 * Where the passages came from (`scope`): the chat's material; the best matches across all the student's
 * materials ("notes", a chat without one), where a source is found by its passage number and keeps its
 * material; or nothing ("none"). When the student asked about their notes (`askedAboutNotes`) and that
 * search found nothing, the label says "Not found in your notes" whatever the reply claims.
 */

export type PassageScope = "material" | "notes" | "none";

export type ReplyGrounding = "material" | "partial" | "general" | "not_found" | "conversation";
/** What is stored and shown: null for small talk (no label). */
export type StoredGrounding = Exclude<ReplyGrounding, "conversation"> | null;

type ReplySource = { position: number; heading: string | null; pages: string | null; quote: string };

export type DraftReply<Visual = unknown> = {
  answer: string;
  grounding: ReplyGrounding;
  sources: ReplySource[];
  additional_explanation: string | null;
  follow_ups: FollowUpId[];
  flashcard: FlashcardDraft | null;
  visual?: Visual | null;
};

export type FinalReply<Visual = unknown> = Omit<DraftReply<Visual>, "grounding" | "sources"> & { grounding: StoredGrounding; sources: TutorSource[] };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Whether a quote really comes from the passage: some run of six of its words (all of them, when it is
 * shorter) appears there in order, ignoring case and punctuation. A model that trims or re-punctuates a quote
 * still passes; one that invents or paraphrases it does not, and neither does a word or two, which proves
 * nothing.
 */
export function quoteInPassage(quote: string, passage: string): boolean {
  const words = normalize(quote).split(" ").filter(Boolean);
  if (words.length < 3) return false;
  const haystack = ` ${normalize(passage)} `;
  const run = Math.min(6, words.length);
  for (let start = 0; start + run <= words.length; start += 1) {
    if (haystack.includes(` ${words.slice(start, start + run).join(" ")} `)) return true;
  }
  return false;
}

function pagesOf(chunk: ContextChunk): string | null {
  if (!chunk.pageStart) return null;
  return chunk.pageEnd && chunk.pageEnd !== chunk.pageStart ? `${chunk.pageStart}-${chunk.pageEnd}` : String(chunk.pageStart);
}

export function finalizeReply<Visual>(
  reply: DraftReply<Visual>,
  chunks: ContextChunk[],
  scope: PassageScope,
  options: { askedAboutNotes?: boolean } = {},
): FinalReply<Visual> {
  const smallTalk = reply.grounding === "conversation";
  const notes = scope === "notes" && chunks.length > 0;
  const hasPassages = scope === "material" || notes;
  const notFound = scope === "notes" && chunks.length === 0 && options.askedAboutNotes === true;
  // Across materials a passage is cited by its number in the turn; in a material chat, by its position.
  const known = new Map(chunks.map((chunk) => [notes ? (chunk.ref ?? -1) : chunk.position, chunk]));
  // Only passages that were sent, quoted for real, with their heading and pages filled in from the material.
  const sources: TutorSource[] = smallTalk
    ? []
    : reply.sources
        .filter((source) => known.has(source.position) && quoteInPassage(source.quote, known.get(source.position)!.content))
        .map((source) => {
          const chunk = known.get(source.position)!;
          const found = { position: chunk.position, heading: source.heading ?? chunk.heading, pages: source.pages ?? pagesOf(chunk), quote: source.quote.slice(0, 400) };
          return notes && chunk.materialId ? { ...found, heading: chunk.heading, materialId: chunk.materialId, materialTitle: chunk.materialTitle ?? "" } : found;
        });

  let grounding: StoredGrounding = smallTalk ? null : notFound ? "not_found" : hasPassages ? (reply.grounding as Exclude<ReplyGrounding, "conversation">) : "general";
  // "From your material" needs at least one real quote from it; without one, it is not shown as such.
  if ((grounding === "material" || grounding === "partial") && sources.length === 0) grounding = "general";

  let answer = reply.answer;
  let additional = smallTalk ? null : reply.additional_explanation;
  // An answer that isn't from passages is all general knowledge: a separate "general knowledge" box would repeat it.
  if (additional && (!hasPassages || (notes && grounding !== "material" && grounding !== "partial"))) {
    if (!answer.includes(additional.slice(0, 80))) answer = `${answer.trimEnd()}\n\n${additional}`;
    additional = null;
  }
  return {
    ...reply,
    answer,
    grounding,
    sources,
    additional_explanation: additional,
    follow_ups: smallTalk ? [] : reply.follow_ups,
    flashcard: smallTalk ? null : reply.flashcard,
  };
}
