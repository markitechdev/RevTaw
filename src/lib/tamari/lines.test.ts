import { describe, expect, it } from "vitest";

import { cardsBubble, examBubble, napBubble, quizBubble, reviewsBubble, streakBubble, tamariLanguage, tamariStatus, weakTopicBubble } from "@/lib/tamari/lines";

describe("tamariLanguage", () => {
  it("speaks the response language, Taglish when the student has not chosen", () => {
    expect(tamariLanguage("auto")).toBe("taglish");
    expect(tamariLanguage("taglish")).toBe("taglish");
    expect(tamariLanguage("fil")).toBe("fil");
    expect(tamariLanguage("en")).toBe("en");
    expect(tamariLanguage("other")).toBe("en");
  });
});

describe("tamariStatus", () => {
  it("says what Tamari is doing in Tamari's language", () => {
    expect(tamariStatus("listening", "taglish")).toBe("Nakikinig ako…");
    expect(tamariStatus("thinking", "fil")).toBe("Iniisip ko…");
    expect(tamariStatus("thinking", "en")).toBe("Thinking…");
  });
});

describe("Tamari's bubbles", () => {
  it("counts today's reviews in each language", () => {
    expect(reviewsBubble("taglish", 3, "2026-10-21")).toMatchObject({ id: "due:2026-10-21", text: "May 3 reviews ka today.", state: "idle" });
    expect(reviewsBubble("taglish", 1, "2026-10-21").text).toBe("May 1 review ka today.");
    expect(reviewsBubble("en", 2, "2026-10-21").text).toBe("You have 2 reviews today.");
    expect(reviewsBubble("fil", 2, "2026-10-21").text).toBe("May 2 review ka ngayong araw.");
    expect(cardsBubble("en", 1, "2026-10-21").text).toBe("1 flashcard is due today.");
    expect(cardsBubble("taglish", 6, "2026-10-21").text).toBe("May 6 cards kang due today.");
  });

  it("counts down to an exam without saying exam twice", () => {
    expect(examBubble("taglish", { id: "e1", title: "Calculus", daysLeft: 3 })).toMatchObject({ id: "exam:e1:3", text: "3 days na lang bago Calculus exam mo.", state: "idle" });
    expect(examBubble("en", { id: "e1", title: "Biology Midterm", daysLeft: 5 }).text).toBe("5 days left before your Biology Midterm.");
    expect(examBubble("taglish", { id: "e1", title: "Physics exam", daysLeft: 1 })).toMatchObject({ text: "Bukas na ang Physics exam mo. Review tayo?", state: "exam" });
    expect(examBubble("fil", { id: "e1", title: "Chemistry", daysLeft: 0 }).text).toBe("Araw na ng Chemistry exam mo! Kaya mo 'yan.");
    expect(examBubble("en", { id: "e9", title: "Calculus", daysLeft: 2 }).action).toEqual({ label: "Open the plan", kind: "open", href: "/planner/e9" });
  });

  it("nudges, never scolds, about a streak that ends tonight", () => {
    const bubble = streakBubble("taglish", 5, "2026-10-21");
    expect(bubble).toMatchObject({ id: "streak:2026-10-21", state: "idle", text: "5-day streak. Sayang pag pinutol mo ngayon." });
    expect(bubble.action).toMatchObject({ kind: "open", href: "/study?method=rapid_review" });
  });

  it("offers to go over a weak topic, grounded in its material", () => {
    expect(weakTopicBubble("taglish", { id: "c1", name: "Binary Trees", materialId: "m1" })).toMatchObject({
      id: "weak:c1",
      text: "Balikan natin ang Binary Trees?",
      action: { label: "Sige!", kind: "ask", materialId: "m1" },
    });
  });

  it("cheers after a quiz, or nudges toward the misses", () => {
    expect(quizBubble("taglish", { id: "a1", correct: 8, total: 10, previousPercent: null })).toMatchObject({ id: "quiz:a1", text: "Bitaw! 8/10.", state: "confident" });
    expect(quizBubble("en", { id: "a1", correct: 84, total: 100, previousPercent: 68 })).toMatchObject({ text: "Bitaw! From 68% to 84%.", state: "confident" });
    expect(quizBubble("taglish", { id: "a1", correct: 10, total: 10, previousPercent: 100 })).toMatchObject({ text: "Ayun. Gets mo na 'yan.", state: "confident" });
    expect(quizBubble("taglish", { id: "a1", correct: 6, total: 10, previousPercent: 58 })).toMatchObject({ text: "6/10. Ayos! Balikan natin ang mga mali?", state: "idle" });
    const low = quizBubble("taglish", { id: "a1", correct: 2, total: 10, previousPercent: null });
    expect(low).toMatchObject({ text: "Mukhang may kailangan pa tayong balikan dito.", state: "serious" });
    expect(low?.action).toMatchObject({ kind: "ask", prompt: "Which questions did I get wrong, and why?" });
    expect(quizBubble("en", { id: "a1", correct: 0, total: 0, previousPercent: null })).toBeNull();
  });

  it("asks for a review after a nap, once per session", () => {
    expect(napBubble("taglish")).toMatchObject({ id: "nap", text: "Uy, buhay ka pa pala. Review?" });
    expect(napBubble("en").text).toBe("Oh hey, you're back. Review?");
  });
});
