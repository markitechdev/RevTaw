import type { ContextChunk } from "@/lib/tutor/context";
import type { FlashcardDraft, FollowUpId, TutorSource } from "@/lib/tutor/types";

/**
 * Checks a reply before it is saved and shown, so its labels say honestly where it came from:
 * small talk carries no source label, a chat with no material never claims to use one, general knowledge
 * added to a material answer stays apart only when there is a material to tell it apart from, and sources
 * point only at passages that were actually sent.
 */

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

function pagesOf(chunk: ContextChunk): string | null {
  if (!chunk.pageStart) return null;
  return chunk.pageEnd && chunk.pageEnd !== chunk.pageStart ? `${chunk.pageStart}-${chunk.pageEnd}` : String(chunk.pageStart);
}

export function finalizeReply<Visual>(reply: DraftReply<Visual>, chunks: ContextChunk[], hasMaterial: boolean): FinalReply<Visual> {
  const smallTalk = reply.grounding === "conversation";
  const known = new Map(chunks.map((chunk) => [chunk.position, chunk]));
  // Only passages that were sent, with their heading and pages filled in from the material.
  const sources: TutorSource[] = smallTalk
    ? []
    : reply.sources
        .filter((source) => known.has(source.position))
        .map((source) => {
          const chunk = known.get(source.position)!;
          return { position: source.position, heading: source.heading ?? chunk.heading, pages: source.pages ?? pagesOf(chunk), quote: source.quote.slice(0, 400) };
        });

  let answer = reply.answer;
  let additional = smallTalk ? null : reply.additional_explanation;
  // With no material, the whole answer is general knowledge: a separate "general knowledge" box would repeat it.
  if (!hasMaterial && additional) {
    if (!answer.includes(additional.slice(0, 80))) answer = `${answer.trimEnd()}\n\n${additional}`;
    additional = null;
  }

  const grounding: StoredGrounding = smallTalk ? null : hasMaterial ? (reply.grounding as Exclude<ReplyGrounding, "conversation">) : "general";
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
