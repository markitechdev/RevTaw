import { routes } from "@/lib/routes";

/**
 * Flashcard reviews are study sessions too ("flashcards" for one deck, "spaced_repetition" for every due card),
 * but they run on the review pages, not in /study/[id]. An unfinished one is picked up again there, in the same
 * session, so its ratings and its summary stay together.
 */

export const REVIEW_METHODS = ["flashcards", "spaced_repetition"] as const;
export const REVIEW_MODES = ["due", "all", "favorites"] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

type ReviewSession = { id: string; method: string; status: string; state: unknown };
type ReviewState = { deckId?: unknown; mode?: unknown; taskId?: unknown };

export function isReviewMethod(method: string): boolean {
  return (REVIEW_METHODS as readonly string[]).includes(method);
}

function reviewState(session: Pick<ReviewSession, "state">): { deckId: string | null; mode: ReviewMode; taskId: string | null } {
  const state = (session.state && typeof session.state === "object" ? session.state : {}) as ReviewState;
  return {
    deckId: typeof state.deckId === "string" ? state.deckId : null,
    mode: typeof state.mode === "string" && (REVIEW_MODES as readonly string[]).includes(state.mode) ? (state.mode as ReviewMode) : "due",
    taskId: typeof state.taskId === "string" ? state.taskId : null,
  };
}

/** Where an unfinished review continues: its deck's review page or the due review, told which session to pick up. */
export function reviewResumeHref(session: ReviewSession): string | null {
  if (session.status !== "in_progress" || !isReviewMethod(session.method)) return null;
  const { deckId, mode, taskId } = reviewState(session);
  const params = new URLSearchParams();
  if (session.method === "flashcards") {
    if (!deckId) return null;
    if (mode !== "due") params.set("mode", mode);
    params.set("session", session.id);
    return `${routes.flashcards}/${deckId}/review?${params.toString()}`;
  }
  params.set("session", session.id);
  if (taskId) params.set("task", taskId);
  return `${routes.flashcards}/review?${params.toString()}`;
}

/** Whether a review page (one deck, or every due card when `deckId` is null) can pick this session up again. */
export function resumesReview(session: Omit<ReviewSession, "id">, page: { deckId: string | null; mode: ReviewMode }): boolean {
  if (session.status !== "in_progress") return false;
  const { deckId, mode } = reviewState(session);
  if (mode !== page.mode) return false;
  return page.deckId ? session.method === "flashcards" && deckId === page.deckId : session.method === "spaced_repetition";
}
