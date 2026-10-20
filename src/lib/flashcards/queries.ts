import "server-only";

import { cache } from "react";

import type { Flashcard, FlashcardDeck } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type MaterialRef = { id: string; title: string; subject: { name: string } | null } | null;

export type DeckListItem = Pick<FlashcardDeck, "id" | "material_id" | "title" | "status" | "status_detail" | "card_count" | "created_at" | "updated_at"> & {
  material: MaterialRef;
  dueCount: number;
  boxes: number[];
};

const DECK_COLUMNS =
  "id, material_id, title, status, status_detail, card_count, created_at, updated_at, material:materials!flashcard_decks_material_fk(id, title, subject:subjects!materials_subject_fk(name))";

async function dueAndBoxesByDeck(supabase: Awaited<ReturnType<typeof createClient>>, deckIds: string[]) {
  const stats = new Map<string, { dueCount: number; boxes: number[] }>();
  if (deckIds.length === 0) return stats;
  const now = new Date().toISOString();
  const { data } = await supabase.from("flashcards").select("deck_id, box, due_at, suspended").in("deck_id", deckIds).limit(5000);
  for (const card of data ?? []) {
    const entry = stats.get(card.deck_id) ?? { dueCount: 0, boxes: [0, 0, 0, 0, 0] };
    if (!card.suspended) {
      if (card.due_at <= now) entry.dueCount += 1;
      entry.boxes[Math.min(5, Math.max(1, card.box)) - 1] += 1;
    }
    stats.set(card.deck_id, entry);
  }
  return stats;
}

export async function listDecks(filters: { materialId?: string } = {}): Promise<DeckListItem[]> {
  const supabase = await createClient();
  let query = supabase.from("flashcard_decks").select(DECK_COLUMNS).is("archived_at", null).order("updated_at", { ascending: false }).limit(200);
  if (filters.materialId) query = query.eq("material_id", filters.materialId);
  const { data, error } = await query;
  if (error) {
    console.error("flashcard_decks: list failed", error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as Omit<DeckListItem, "dueCount" | "boxes">[];
  const stats = await dueAndBoxesByDeck(supabase, rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, dueCount: stats.get(row.id)?.dueCount ?? 0, boxes: stats.get(row.id)?.boxes ?? [0, 0, 0, 0, 0] }));
}

export type CardView = Pick<
  Flashcard,
  "id" | "position" | "front" | "back" | "hint" | "source_excerpt" | "favorite" | "suspended" | "box" | "ease" | "interval_days" | "repetitions" | "lapses" | "due_at" | "last_reviewed_at" | "last_rating"
> & { concept: { id: string; name: string } | null };

export type DeckDetail = Omit<FlashcardDeck, "material_id"> & {
  material_id: string;
  material: MaterialRef;
  cards: CardView[];
  dueCount: number;
  boxes: number[];
  nextDueAt: string | null;
  /** When the deck was read (ISO), the reference time for "due in N days" labels. */
  fetchedAt: string;
};

const CARD_COLUMNS =
  "id, position, front, back, hint, source_excerpt, favorite, suspended, box, ease, interval_days, repetitions, lapses, due_at, last_reviewed_at, last_rating, concept:concepts!flashcards_concept_fk(id, name)";

export const getDeck = cache(async (deckId: string): Promise<DeckDetail | null> => {
  const supabase = await createClient();
  const [{ data: deck, error }, { data: cards }] = await Promise.all([
    supabase
      .from("flashcard_decks")
      .select("*, material:materials!flashcard_decks_material_fk(id, title, subject:subjects!materials_subject_fk(name))")
      .eq("id", deckId)
      .maybeSingle(),
    supabase.from("flashcards").select(CARD_COLUMNS).eq("deck_id", deckId).order("position"),
  ]);
  if (error) {
    console.error("flashcard_decks: get failed", error.message);
    return null;
  }
  if (!deck) return null;
  const now = new Date().toISOString();
  const active = ((cards ?? []) as unknown as CardView[]).filter((card) => !card.suspended);
  const boxes = [0, 0, 0, 0, 0];
  for (const card of active) boxes[Math.min(5, Math.max(1, card.box)) - 1] += 1;
  const future = active.filter((card) => card.due_at > now).map((card) => card.due_at).sort();
  return {
    ...(deck as unknown as Omit<DeckDetail, "cards" | "dueCount" | "boxes" | "nextDueAt" | "fetchedAt">),
    cards: (cards ?? []) as unknown as CardView[],
    dueCount: active.filter((card) => card.due_at <= now).length,
    boxes,
    nextDueAt: future[0] ?? null,
    fetchedAt: now,
  };
});

export type ReviewQueueCard = CardView & { deck: { id: string; title: string } };

/**
 * Cards to review: due cards first (oldest due first), optionally padded with
 * not-yet-due cards when the student asks to study the whole deck.
 */
export async function getReviewQueue(options: { deckId?: string; mode: "due" | "all" | "favorites"; limit?: number }): Promise<ReviewQueueCard[]> {
  const supabase = await createClient();
  const limit = options.limit ?? 100;
  let query = supabase
    .from("flashcards")
    .select(`${CARD_COLUMNS}, deck:flashcard_decks!flashcards_deck_fk(id, title, archived_at)`)
    .eq("suspended", false)
    .order("due_at", { ascending: true })
    .limit(limit);
  if (options.deckId) query = query.eq("deck_id", options.deckId);
  if (options.mode === "due") query = query.lte("due_at", new Date().toISOString());
  if (options.mode === "favorites") query = query.eq("favorite", true);
  const { data, error } = await query;
  if (error) {
    console.error("flashcards: queue failed", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Array<ReviewQueueCard & { deck: { archived_at: string | null } }>).filter((card) => !card.deck.archived_at);
}

/** Random order for "shuffle" study; done on the server so the first render and hydration agree. */
export function shuffleQueue<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export const countDueCards = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("suspended", false)
    .lte("due_at", new Date().toISOString());
  return count ?? 0;
});

export const countCards = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("suspended", false);
  return count ?? 0;
});

/** Next moment any card becomes due (for "next review" hints). */
export const nextDueAt = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("flashcards")
    .select("due_at")
    .eq("suspended", false)
    .gt("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.due_at ?? null;
});
