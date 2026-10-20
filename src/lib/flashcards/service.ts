import "server-only";

import { refreshMastery } from "@/lib/adaptive/engine";
import { ensureConcepts, normalizeConceptName } from "@/lib/concepts/service";
import { generateFlashcards } from "@/lib/flashcards/generate";
import { schedule, type SchedulerState } from "@/lib/flashcards/scheduler";
import { friendlyGenerationFailure, loadMaterialContext, ServiceError } from "@/lib/reviewers/service";
import type { FlashcardRating } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export { ServiceError };

export async function createDeck(materialId: string, options: { count: number; focus: string | null }): Promise<{ id: string; status: "ready" | "failed"; detail: string | null }> {
  const supabase = await createClient();
  const context = await loadMaterialContext(supabase, materialId);
  const { data: deck, error } = await supabase
    .from("flashcard_decks")
    .insert({ user_id: context.material.user_id, material_id: materialId, title: `${context.material.title} — Flashcards`, status: "generating" })
    .select("id")
    .single();
  if (error || !deck) throw new Error(`flashcard_decks: insert failed: ${error?.message}`);
  const result = await populateDeck(supabase, deck.id, context, options);
  return { id: deck.id, ...result };
}

export async function retryDeck(deckId: string, options: { count: number; focus: string | null }): Promise<{ status: "ready" | "failed"; detail: string | null }> {
  const supabase = await createClient();
  const { data: deck } = await supabase.from("flashcard_decks").select("id, material_id, status").eq("id", deckId).maybeSingle();
  if (!deck) throw new ServiceError("Deck not found.", 404);
  if (deck.status === "generating") return { status: "failed", detail: "Still generating." };
  const context = await loadMaterialContext(supabase, deck.material_id);
  await supabase.from("flashcard_decks").update({ status: "generating", status_detail: null }).eq("id", deck.id);
  await supabase.from("flashcards").delete().eq("deck_id", deck.id);
  return populateDeck(supabase, deck.id, context, options);
}

async function populateDeck(
  supabase: Client,
  deckId: string,
  context: Awaited<ReturnType<typeof loadMaterialContext>>,
  options: { count: number; focus: string | null },
): Promise<{ status: "ready" | "failed"; detail: string | null }> {
  try {
    const result = await generateFlashcards(context.material.title, context.chunks, options, context.student);
    if (result.cards.length === 0) throw new ServiceError("No cards could be written from this material.", 422);
    const concepts = await ensureConcepts(
      supabase,
      context.material.user_id,
      result.cards.map((card) => card.concept),
      { materialId: context.material.id, subjectId: context.material.subject_id },
    );
    const { error } = await supabase.from("flashcards").insert(
      result.cards.map((card, position) => ({
        deck_id: deckId,
        user_id: context.material.user_id,
        position,
        front: card.front,
        back: card.back,
        hint: card.hint,
        concept_id: concepts.get(normalizeConceptName(card.concept)) ?? null,
        source_excerpt: card.source_excerpt || null,
      })),
    );
    if (error) throw new Error(`flashcards: insert failed: ${error.message}`);
    const notes: string[] = [];
    if (result.cards.length < options.count) notes.push(`${result.cards.length} of ${options.count} requested cards could be supported by the material.`);
    if (result.coverageRatio < 1) notes.push(`Built from the first ${Math.round(result.coverageRatio * 100)}% of a very long material.`);
    const detail = notes.length ? notes.join(" ") : null;
    await supabase
      .from("flashcard_decks")
      .update({ title: result.title, status: "ready", status_detail: detail, provider: result.provider, model: result.model, card_count: result.cards.length })
      .eq("id", deckId);
    return { status: "ready", detail };
  } catch (generationError) {
    console.error(`flashcards: generation for ${deckId} failed`, generationError);
    const detail = friendlyGenerationFailure(generationError);
    await supabase.from("flashcard_decks").update({ status: "failed", status_detail: detail, card_count: 0 }).eq("id", deckId);
    return { status: "failed", detail };
  }
}

export type ReviewResult = {
  box: number;
  intervalDays: number;
  dueAt: string;
};

/** Applies a rating: updates the card's schedule, logs the review and updates the session counters. */
export async function reviewCard(input: { cardId: string; rating: FlashcardRating; responseMs: number | null; sessionId: string | null }): Promise<ReviewResult> {
  const supabase = await createClient();
  const { data: card } = await supabase
    .from("flashcards")
    .select("id, user_id, box, ease, interval_days, repetitions, lapses, suspended, concept_id")
    .eq("id", input.cardId)
    .maybeSingle();
  if (!card) throw new ServiceError("Card not found.", 404);
  if (card.suspended) throw new ServiceError("This card is suspended.", 409);

  const state: SchedulerState = { box: card.box, ease: Number(card.ease), interval_days: card.interval_days, repetitions: card.repetitions, lapses: card.lapses };
  const now = new Date();
  const next = schedule(state, input.rating, now);

  const { error } = await supabase
    .from("flashcards")
    .update({
      box: next.box,
      ease: next.ease,
      interval_days: next.interval_days,
      repetitions: next.repetitions,
      lapses: next.lapses,
      due_at: next.due_at,
      last_reviewed_at: now.toISOString(),
      last_rating: input.rating,
    })
    .eq("id", card.id);
  if (error) throw new Error(`flashcards: update failed: ${error.message}`);

  const { error: logError } = await supabase.from("flashcard_reviews").insert({
    user_id: card.user_id,
    card_id: card.id,
    session_id: input.sessionId,
    rating: input.rating,
    response_ms: input.responseMs,
    box_before: card.box,
    box_after: next.box,
    interval_days: next.interval_days,
    due_at: next.due_at,
    reviewed_at: now.toISOString(),
  });
  if (logError) console.error("flashcard_reviews: insert failed", logError.message);

  if (input.sessionId) {
    const { data: session } = await supabase.from("study_sessions").select("id, status, items_total, items_correct, items_incorrect").eq("id", input.sessionId).maybeSingle();
    if (session && session.status === "in_progress") {
      await supabase
        .from("study_sessions")
        .update({
          items_total: session.items_total + 1,
          items_correct: session.items_correct + (input.rating === "again" ? 0 : 1),
          items_incorrect: session.items_incorrect + (input.rating === "again" ? 1 : 0),
          last_active_at: now.toISOString(),
        })
        .eq("id", session.id);
    }
  }

  if (card.concept_id) await refreshMastery([card.concept_id]);
  return { box: next.box, intervalDays: next.interval_days, dueAt: next.due_at };
}
