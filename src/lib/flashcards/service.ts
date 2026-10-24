import "server-only";

import { refreshMastery } from "@/lib/adaptive/engine";
import { ensureConcepts, normalizeConceptName } from "@/lib/concepts/service";
import { ServiceError } from "@/lib/errors";
import { generateFlashcards } from "@/lib/flashcards/generate";
import { describeWait } from "@/lib/engine/fsrs";
import { currentSnapshot, ratingWaits, scheduleCard, scheduleColumns } from "@/lib/flashcards/scheduler";
import { claimForRetry, retryRefusal } from "@/lib/generation/retry";
import { friendlyGenerationFailure, loadMaterialContext } from "@/lib/reviewers/service";
import { countSessionAnswer } from "@/lib/study/sessions";
import type { FlashcardRating } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { clampTitle, titleWithSuffix } from "@/lib/text/clamp";

type Client = Awaited<ReturnType<typeof createClient>>;


export async function createDeck(materialId: string, options: { count: number; focus: string | null }): Promise<{ id: string; status: "ready" | "failed"; detail: string | null }> {
  const supabase = await createClient();
  const context = await loadMaterialContext(supabase, materialId);
  const { data: deck, error } = await supabase
    .from("flashcard_decks")
    .insert({ user_id: context.material.user_id, material_id: materialId, title: titleWithSuffix(context.material.title, "Flashcards"), status: "generating" })
    .select("id")
    .single();
  if (error || !deck) throw new Error(`flashcard_decks: insert failed: ${error?.message}`);
  const result = await populateDeck(supabase, deck.id, context, options);
  return { id: deck.id, ...result };
}

export async function retryDeck(deckId: string, options: { count: number; focus: string | null }): Promise<{ status: "ready" | "failed"; detail: string | null }> {
  const supabase = await createClient();
  const { data: deck } = await supabase.from("flashcard_decks").select("id, material_id, status, status_detail, updated_at").eq("id", deckId).maybeSingle();
  if (!deck) throw new ServiceError("Deck not found.", 404);
  const context = await loadMaterialContext(supabase, deck.material_id);
  // Only a failed deck (or one cut off while generating) is regenerated, by one request at a time.
  if (!(await claimForRetry(supabase, "flashcard_decks", deck.id))) throw new ServiceError(retryRefusal(deck.status, "deck"), 409);
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
    const { error: readyError } = await supabase
      .from("flashcard_decks")
      .update({ title: clampTitle(result.title), status: "ready", status_detail: detail, provider: result.provider, model: result.model, card_count: result.cards.length })
      .eq("id", deckId);
    if (readyError) throw new Error(`flashcard_decks: ready update failed: ${readyError.message}`);
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
  /** "10 min", "2 days": when the card comes back. */
  wait: string;
  /** What each rating would do the next time the card is shown. */
  waits: Record<FlashcardRating, string>;
};

/** Applies a rating: updates the card's schedule, logs the review and updates the session counters. */
export async function reviewCard(input: { cardId: string; rating: FlashcardRating; responseMs: number | null; sessionId: string | null }): Promise<ReviewResult> {
  const supabase = await createClient();
  const { data: card } = await supabase
    .from("flashcards")
    .select("id, user_id, box, suspended, concept_id, repetitions, lapses, due_at, last_reviewed_at, fsrs_stability, fsrs_difficulty, fsrs_state, fsrs_learning_steps, fsrs_scheduled_days")
    .eq("id", input.cardId)
    .maybeSingle();
  if (!card) throw new ServiceError("Card not found.", 404);
  if (card.suspended) throw new ServiceError("This card is suspended.", 409);

  // Cards scheduled before FSRS are rebuilt from their review history on their first FSRS review.
  let history: Array<{ at: string; rating: FlashcardRating }> = [];
  if (card.fsrs_stability === null && card.last_reviewed_at) {
    const { data: reviews } = await supabase.from("flashcard_reviews").select("rating, reviewed_at").eq("card_id", card.id).order("reviewed_at", { ascending: true }).limit(500);
    history = (reviews ?? []).map((row) => ({ at: row.reviewed_at, rating: row.rating }));
  }
  const now = new Date();
  const next = scheduleCard(currentSnapshot(card, history), input.rating, now);

  const { error } = await supabase
    .from("flashcards")
    .update({ ...scheduleColumns(next), last_reviewed_at: now.toISOString(), last_rating: input.rating })
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
    interval_days: next.intervalDays,
    due_at: next.dueAt,
    reviewed_at: now.toISOString(),
    fsrs_state: next.snapshot.state,
    stability: Math.round(next.snapshot.stability * 10_000) / 10_000,
    difficulty: Math.round(next.snapshot.difficulty * 10_000) / 10_000,
    retrievability: next.recallBefore === null ? null : Math.round(next.recallBefore * 10_000) / 10_000,
  });
  if (logError) console.error("flashcard_reviews: insert failed", logError.message);

  if (input.sessionId) await countSessionAnswer(supabase, input.sessionId, { correct: input.rating !== "again" });

  if (card.concept_id) await refreshMastery([card.concept_id]);
  return { box: next.box, intervalDays: next.intervalDays, dueAt: next.dueAt, wait: describeWait(new Date(next.dueAt), now), waits: ratingWaits(next.snapshot, now) };
}
