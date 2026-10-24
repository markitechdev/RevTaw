"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ServiceError } from "@/lib/errors";
import { reviewCard, type ReviewResult } from "@/lib/flashcards/service";
import { routes } from "@/lib/routes";
import { completeSession, createSession, sessionTitle, suggestNext, type SessionSummary } from "@/lib/study/sessions";
import { readPages } from "@/lib/supabase/paginate";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { titleWithSuffix } from "@/lib/text/clamp";

export type FlashcardActionResult<T = undefined> = ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T })) | { ok: false; message: string };

const uuid = z.uuid();

function revalidate(deckId?: string) {
  revalidatePath(routes.flashcards);
  revalidatePath(routes.dashboard);
  revalidatePath(routes.study);
  if (deckId) revalidatePath(`${routes.flashcards}/${deckId}`);
}

function failure(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof ServiceError) return { ok: false, message: error.message };
  console.error(fallback, error);
  return { ok: false, message: fallback };
}

/** Opens a review session (method "flashcards" for one deck, "spaced_repetition" for all due cards). */
export async function startReviewSessionAction(input: { deckId: string | null; mode: "due" | "all" | "favorites"; cardCount: number; taskId?: string | null }): Promise<FlashcardActionResult<{ sessionId: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ deckId: uuid.nullable(), mode: z.enum(["due", "all", "favorites"]), cardCount: z.number().int().min(0).max(500), taskId: uuid.nullable().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid review." };
  try {
    const supabase = await createClient();
    let materialId: string | null = null;
    let title = sessionTitle("spaced_repetition", null);
    if (parsed.data.deckId) {
      const { data: deck } = await supabase.from("flashcard_decks").select("id, title, material_id").eq("id", parsed.data.deckId).maybeSingle();
      if (!deck) return { ok: false, message: "Deck not found." };
      materialId = deck.material_id;
      title = titleWithSuffix(deck.title, "Review");
    }
    const { id } = await createSession(supabase, user.id, {
      method: parsed.data.deckId ? "flashcards" : "spaced_repetition",
      materialId,
      goal: "memorize",
      plannedMinutes: null,
      title,
      state: { deckId: parsed.data.deckId, mode: parsed.data.mode, cardCount: parsed.data.cardCount, ...(parsed.data.taskId ? { taskId: parsed.data.taskId } : {}) },
    });
    if (parsed.data.taskId) await supabase.from("study_tasks").update({ session_id: id }).eq("id", parsed.data.taskId).eq("status", "pending");
    return { ok: true, data: { sessionId: id } };
  } catch (error) {
    return failure(error, "The review could not be started.");
  }
}

export async function reviewCardAction(input: { cardId: string; rating: "again" | "hard" | "good" | "easy"; responseMs: number | null; sessionId: string | null }): Promise<FlashcardActionResult<ReviewResult>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z
    .object({ cardId: uuid, rating: z.enum(["again", "hard", "good", "easy"]), responseMs: z.number().int().min(0).max(86_400_000).nullable(), sessionId: uuid.nullable() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid rating." };
  try {
    const result = await reviewCard(parsed.data);
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "The rating could not be saved. Check your connection and try again.");
  }
}

/**
 * A review session's counts from the ratings the server saved during it, not from what the browser reports:
 * cards reviewed, and cards whose first rating in the session was "Don't know" (a card that comes back later in
 * the session counts once, as the review screen shows it).
 */
async function sessionReviewCounts(supabase: Awaited<ReturnType<typeof createClient>>, sessionId: string): Promise<{ reviewed: number; again: number }> {
  const rows = await readPages(
    (from, to) => supabase.from("flashcard_reviews").select("card_id, rating").eq("session_id", sessionId).order("reviewed_at").order("id").range(from, to),
    5000,
  );
  const first = new Map<string, string>();
  for (const row of rows) if (!first.has(row.card_id)) first.set(row.card_id, row.rating);
  return { reviewed: first.size, again: [...first.values()].filter((rating) => rating === "again").length };
}

/** Closes a review session and writes its summary. */
export async function finishReviewSessionAction(input: {
  sessionId: string;
  focusSeconds: number;
  reviewed: number;
  again: number;
  topics: string[];
  weakConcepts: string[];
  strongConcepts: string[];
  nextReviewAt: string | null;
}): Promise<FlashcardActionResult<SessionSummary>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z
    .object({
      sessionId: uuid,
      focusSeconds: z.number().int().min(0).max(86_400),
      reviewed: z.number().int().min(0).max(1000),
      again: z.number().int().min(0).max(1000),
      topics: z.array(z.string().max(120)).max(30),
      weakConcepts: z.array(z.string().max(120)).max(20),
      strongConcepts: z.array(z.string().max(120)).max(20),
      nextReviewAt: z.string().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid summary." };
  try {
    const supabase = await createClient();
    // Counted from the ratings the server saved during the session, not from what the browser reports.
    const { reviewed, again } = await sessionReviewCounts(supabase, parsed.data.sessionId);
    const correct = Math.max(0, reviewed - again);
    const accuracy = reviewed > 0 ? correct / reviewed : null;
    const summary = await completeSession(supabase, parsed.data.sessionId, {
      focusSeconds: parsed.data.focusSeconds,
      topics: parsed.data.topics,
      questionsAnswered: reviewed,
      correct,
      incorrect: again,
      weakConcepts: parsed.data.weakConcepts,
      strongConcepts: parsed.data.strongConcepts,
      suggestedNext:
        reviewed === 0
          ? "Nothing was reviewed. Come back when cards are due, or study the whole deck."
          : suggestNext(accuracy, parsed.data.weakConcepts, "flashcards"),
      nextReviewAt: parsed.data.nextReviewAt,
    });
    revalidate();
    return { ok: true, data: summary };
  } catch (error) {
    return failure(error, "The session could not be saved.");
  }
}

export async function toggleFavoriteAction(cardId: string, favorite: boolean): Promise<FlashcardActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = uuid.safeParse(cardId);
  if (!parsed.success) return { ok: false, message: "Invalid card." };
  const supabase = await createClient();
  const { error } = await supabase.from("flashcards").update({ favorite }).eq("id", parsed.data);
  if (error) return { ok: false, message: "The card could not be updated." };
  return { ok: true };
}

export async function updateCardAction(input: { cardId: string; front: string; back: string; hint: string | null; suspended?: boolean }): Promise<FlashcardActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z
    .object({
      cardId: uuid,
      front: z.string().trim().min(1, "The front cannot be empty.").max(2000),
      back: z.string().trim().min(1, "The back cannot be empty.").max(4000),
      hint: z.string().trim().max(500).nullable(),
      suspended: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the card." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("flashcards")
    .update({ front: parsed.data.front, back: parsed.data.back, hint: parsed.data.hint || null, ...(parsed.data.suspended !== undefined ? { suspended: parsed.data.suspended } : {}) })
    .eq("id", parsed.data.cardId)
    .select("deck_id")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "The card could not be saved." };
  revalidate(data.deck_id);
  return { ok: true };
}

export async function renameDeckAction(deckId: string, title: string): Promise<FlashcardActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ deckId: uuid, title: z.string().trim().min(1).max(160) }).safeParse({ deckId, title });
  if (!parsed.success) return { ok: false, message: "Enter a title of up to 160 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("flashcard_decks").update({ title: parsed.data.title }).eq("id", parsed.data.deckId);
  if (error) return { ok: false, message: "The title could not be saved." };
  revalidate(parsed.data.deckId);
  return { ok: true };
}

export async function deleteDeckAction(deckId: string): Promise<FlashcardActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = uuid.safeParse(deckId);
  if (!parsed.success) return { ok: false, message: "Invalid deck." };
  const supabase = await createClient();
  const { error } = await supabase.from("flashcard_decks").delete().eq("id", parsed.data);
  if (error) return { ok: false, message: "The deck could not be deleted." };
  revalidate();
  return { ok: true };
}
