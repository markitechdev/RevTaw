import { describe, expect, it } from "vitest";

import { cardsLine, examLine, formatLater, goalLine, improvementLine, offerLine, parseLater, planFinishedLine, repeatedLine, reviewsLine, streakLine, weakestLine } from "@/lib/tamari/coach";

describe("Tamari's lines on Home", () => {
  it("says today's reviews and offers to start the first one", () => {
    expect(reviewsLine("taglish", { count: 3, taskId: "t1", topic: "Binary Trees" }, "2026-10-21")).toEqual({
      id: "due:2026-10-21:3",
      state: "idle",
      text: "May 3 reviews ka today. Unahin natin Binary Trees?",
      action: { label: "Start Review", kind: "task", taskId: "t1" },
    });
    expect(reviewsLine("en", { count: 1, taskId: "t1", topic: null }, "2026-10-21").text).toBe("You have 1 review today.");
  });

  it("counts down to an exam in exam mode and plans 20 minutes for it", () => {
    expect(examLine("taglish", { id: "e1", title: "Calculus", daysLeft: 3 })).toMatchObject({ text: "3 days na lang bago Calculus exam mo.", state: "exam", action: { kind: "plan", minutes: 20 } });
    expect(examLine("taglish", { id: "e1", title: "Calculus", daysLeft: 1 }).text).toBe("Bukas na ang Calculus exam mo. Review tayo?");
  });

  it("gets serious about a concept missed again and again, and asks the student to explain it", () => {
    const line = repeatedLine("taglish", { id: "c1", name: "Binary Trees", count: 3, materialId: "m1" });
    expect(line).toMatchObject({ state: "serious", text: "Tatlong beses na nating namiss ang Binary Trees. Tara, explain mo sakin." });
    expect(line.action).toMatchObject({ kind: "session", method: "feynman", materialId: "m1", concepts: ["Binary Trees"] });
    expect(repeatedLine("en", { id: "c1", name: "Recursion", count: 4, materialId: null }).action).toMatchObject({ kind: "ask" });
  });

  it("nudges a streak, cards, improvement, a finished plan and the weakest topic in the doc's words", () => {
    expect(streakLine("taglish", 5, "2026-10-21").text).toBe("5-day streak. Sayang pag pinutol mo ngayon.");
    expect(cardsLine("taglish", 6, "2026-10-21").text).toBe("May 6 cards kang due today.");
    expect(improvementLine("taglish", { attemptId: "a1", from: 68, to: 84, materialId: "m1" })).toMatchObject({ state: "confident", text: "Bitaw! From 68% to 84%." });
    expect(planFinishedLine("taglish", { sessionId: "s1", correct: 9, answered: 10, firstAccuracy: 0.6, lastAccuracy: 1 })).toMatchObject({ state: "confident", text: "Bitaw. 9/10. Mas okay na." });
    expect(weakestLine("taglish", { id: "c2", name: "Recursion", materialId: "m1" }).text).toBe("Recursion pa rin pinakamahinang topic mo.");
    expect(offerLine("taglish")).toBe("May 20 minutes ka? Ako na bahala.");
    expect(goalLine("taglish", { id: "g1:2026-10-21", label: "Study 60 minutes today" })).toMatchObject({ id: "goal:g1:2026-10-21", state: "confident", text: "Bitaw! Naabot mo na: Study 60 minutes today." });
  });

  it("remembers today's \"Later\" in a cookie-safe value and forgets it tomorrow", () => {
    const value = formatLater("2026-10-21", ["due:2026-10-21:3", "exam:e1:3"]);
    expect(value).toMatch(/^[\w:~!.-]+$/);
    expect(parseLater(value, "2026-10-21")).toEqual(["due:2026-10-21:3", "exam:e1:3"]);
    expect(parseLater(value, "2026-10-22")).toEqual([]);
    expect(parseLater("2026-10-21~<script>!due:x", "2026-10-21")).toEqual(["due:x"]);
    expect(parseLater(undefined, "2026-10-21")).toEqual([]);
  });
});
