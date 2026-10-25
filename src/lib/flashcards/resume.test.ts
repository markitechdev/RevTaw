import { describe, expect, it } from "vitest";

import { isReviewMethod, resumesReview, reviewResumeHref } from "./resume";

const SESSION = "11111111-1111-4111-8111-111111111111";
const DECK = "22222222-2222-4222-8222-222222222222";
const TASK = "33333333-3333-4333-8333-333333333333";

describe("unfinished flashcard reviews", () => {
  it("knows which study methods are flashcard reviews", () => {
    expect(isReviewMethod("flashcards")).toBe(true);
    expect(isReviewMethod("spaced_repetition")).toBe(true);
    expect(isReviewMethod("active_recall")).toBe(false);
  });

  it("continues a deck review on that deck's review page, in the same session and mode", () => {
    expect(reviewResumeHref({ id: SESSION, method: "flashcards", status: "in_progress", state: { deckId: DECK, mode: "due", cardCount: 4 } })).toBe(
      `/flashcards/${DECK}/review?session=${SESSION}`,
    );
    expect(reviewResumeHref({ id: SESSION, method: "flashcards", status: "in_progress", state: { deckId: DECK, mode: "all" } })).toBe(
      `/flashcards/${DECK}/review?mode=all&session=${SESSION}`,
    );
  });

  it("continues a due-card review on the due review page, keeping its planner task", () => {
    expect(reviewResumeHref({ id: SESSION, method: "spaced_repetition", status: "in_progress", state: { deckId: null, mode: "due" } })).toBe(`/flashcards/review?session=${SESSION}`);
    expect(reviewResumeHref({ id: SESSION, method: "spaced_repetition", status: "in_progress", state: { deckId: null, mode: "due", taskId: TASK } })).toBe(
      `/flashcards/review?session=${SESSION}&task=${TASK}`,
    );
  });

  it("leaves other methods, finished reviews and broken states to the study page", () => {
    expect(reviewResumeHref({ id: SESSION, method: "active_recall", status: "in_progress", state: {} })).toBeNull();
    expect(reviewResumeHref({ id: SESSION, method: "flashcards", status: "completed", state: { deckId: DECK, mode: "due" } })).toBeNull();
    expect(reviewResumeHref({ id: SESSION, method: "flashcards", status: "in_progress", state: { mode: "due" } })).toBeNull();
    expect(reviewResumeHref({ id: SESSION, method: "flashcards", status: "in_progress", state: null })).toBeNull();
  });

  it("lets a review page pick up only its own kind of unfinished session", () => {
    const deckReview = { method: "flashcards", status: "in_progress", state: { deckId: DECK, mode: "due" } };
    expect(resumesReview(deckReview, { deckId: DECK, mode: "due" })).toBe(true);
    expect(resumesReview(deckReview, { deckId: DECK, mode: "all" })).toBe(false);
    expect(resumesReview(deckReview, { deckId: "44444444-4444-4444-8444-444444444444", mode: "due" })).toBe(false);
    expect(resumesReview(deckReview, { deckId: null, mode: "due" })).toBe(false);
    expect(resumesReview({ ...deckReview, status: "completed" }, { deckId: DECK, mode: "due" })).toBe(false);

    const dueReview = { method: "spaced_repetition", status: "in_progress", state: { deckId: null, mode: "due" } };
    expect(resumesReview(dueReview, { deckId: null, mode: "due" })).toBe(true);
    expect(resumesReview(dueReview, { deckId: DECK, mode: "due" })).toBe(false);
    expect(resumesReview({ method: "active_recall", status: "in_progress", state: {} }, { deckId: null, mode: "due" })).toBe(false);
  });
});
