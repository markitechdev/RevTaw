import "server-only";

import { cache } from "react";

import { currentSnapshot, ratingWaits } from "@/lib/flashcards/scheduler";
import { settleGenerationStatus } from "@/lib/generation/stale";
import { pageOf, type Page } from "@/lib/pagination";
import type { Flashcard, FlashcardDeck, FlashcardRating } from "@/lib/supabase/database.types";
import { fetchPage, readPagesQuietly } from "@/lib/supabase/paginate";
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
  // Suspended cards count toward neither figure, so they are left out of the read.
  const cards = await readPagesQuietly("flashcards: deck stats", (from, to) => supabase.from("flashcards").select("deck_id, box, due_at").in("deck_id", deckIds).eq("suspended", false).order("deck_id").order("position").range(from, to), 5000);
  for (const card of cards) {
    const entry = stats.get(card.deck_id) ?? { dueCount: 0, boxes: [0, 0, 0, 0, 0] };
    if (card.due_at <= now) entry.dueCount += 1;
    entry.boxes[Math.min(5, Math.max(1, card.box)) - 1] += 1;
    stats.set(card.deck_id, entry);
  }
  return stats;
}

type DeckRow = Omit<DeckListItem, "dueCount" | "boxes">;

async function withCardStats(supabase: Awaited<ReturnType<typeof createClient>>, rows: DeckRow[]): Promise<DeckListItem[]> {
  const stats = await dueAndBoxesByDeck(supabase, rows.map((row) => row.id));
  return rows.map((row) => ({ ...settleGenerationStatus(row), dueCount: stats.get(row.id)?.dueCount ?? 0, boxes: stats.get(row.id)?.boxes ?? [0, 0, 0, 0, 0] }));
}

/** Decks with what is due in each: a material's (its page lists them all), or every deck for Home's widget. */
export async function listDecks(filters: { materialId?: string } = {}): Promise<DeckListItem[]> {
  const supabase = await createClient();
  let query = supabase.from("flashcard_decks").select(DECK_COLUMNS).is("archived_at", null).order("updated_at", { ascending: false }).limit(200);
  if (filters.materialId) query = query.eq("material_id", filters.materialId);
  const { data, error } = await query;
  if (error) {
    console.error("flashcard_decks: list failed", error.message);
    return [];
  }
  return withCardStats(supabase, (data ?? []) as unknown as DeckRow[]);
}

/** One page of the Flashcards page, most recently updated first (the id breaks ties, so pages never overlap). */
export async function listDecksPage(page: number, pageSize: number): Promise<Page<DeckListItem>> {
  const supabase = await createClient();
  const rows = await fetchPage<DeckRow>(
    "flashcard_decks",
    (head) => supabase.from("flashcard_decks").select(head ? "id" : DECK_COLUMNS, { count: "exact", head }).is("archived_at", null).order("updated_at", { ascending: false }).order("id"),
    page,
    pageSize,
  );
  return pageOf(await withCardStats(supabase, rows.items), rows.total, rows.page, rows.pageSize, rows.beyond);
}

export type CardView = Pick<
  Flashcard,
  | "id"
  | "position"
  | "front"
  | "back"
  | "hint"
  | "source_excerpt"
  | "favorite"
  | "suspended"
  | "box"
  | "interval_days"
  | "repetitions"
  | "lapses"
  | "due_at"
  | "last_reviewed_at"
  | "last_rating"
  | "fsrs_stability"
  | "fsrs_difficulty"
  | "fsrs_state"
  | "fsrs_learning_steps"
  | "fsrs_scheduled_days"
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
  "id, position, front, back, hint, source_excerpt, favorite, suspended, box, interval_days, repetitions, lapses, due_at, last_reviewed_at, last_rating, fsrs_stability, fsrs_difficulty, fsrs_state, fsrs_learning_steps, fsrs_scheduled_days, concept:concepts!flashcards_concept_fk(id, name)";

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
    ...settleGenerationStatus(deck as unknown as Omit<DeckDetail, "cards" | "dueCount" | "boxes" | "nextDueAt" | "fetchedAt">),
    cards: (cards ?? []) as unknown as CardView[],
    dueCount: active.filter((card) => card.due_at <= now).length,
    boxes,
    nextDueAt: future[0] ?? null,
    fetchedAt: now,
  };
});

export type ReviewQueueCard = CardView & {
  deck: { id: string; title: string };
  /** When each rating would bring the card back ("10 min", "2 days"), from its FSRS state. */
  waits: Record<FlashcardRating, string>;
};

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
  const cards = ((data ?? []) as unknown as Array<Omit<ReviewQueueCard, "waits"> & { deck: { archived_at: string | null } }>).filter((card) => !card.deck.archived_at);
  // Cards reviewed before FSRS have no state yet: their history gives it.
  const replay = cards.filter((card) => card.fsrs_stability === null && card.last_reviewed_at).map((card) => card.id);
  const history = new Map<string, Array<{ at: string; rating: FlashcardRating }>>();
  if (replay.length > 0) {
    const reviews = await readPagesQuietly("flashcards: replay history", (from, to) => supabase.from("flashcard_reviews").select("card_id, rating, reviewed_at").in("card_id", replay).order("reviewed_at", { ascending: true }).order("id").range(from, to), 5000);
    for (const row of reviews) history.set(row.card_id, [...(history.get(row.card_id) ?? []), { at: row.reviewed_at, rating: row.rating }]);
  }
  const now = new Date();
  return cards.map((card) => ({ ...card, waits: ratingWaits(currentSnapshot(card, history.get(card.id) ?? []), now) }));
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
