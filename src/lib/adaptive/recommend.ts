import "server-only";

import { cache } from "react";

import { getMasterySummary, type MasteryView } from "@/lib/adaptive/engine";
import { countDueCards } from "@/lib/flashcards/queries";
import { countOpenMistakes } from "@/lib/quizzes/queries";
import { routes } from "@/lib/routes";
import type { StudyMethodId } from "@/lib/study/methods";

/**
 * Recommendations with reasons (spec §22 "RevTaw recommendation", §28
 * "determine what appears next", §15 "recommendations should include a
 * short explanation of why the method was selected").
 */

export type Recommendation = {
  id: string;
  title: string;
  reason: string;
  method: StudyMethodId;
  minutes: number;
  href: string;
  priority: number;
  concepts: string[];
  materialId: string | null;
};

function label(row: MasteryView): string {
  return row.concept?.name ?? "this concept";
}

function materialOf(rows: MasteryView[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = row.concept?.material_id;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function sessionHref(method: StudyMethodId, materialId: string | null): string {
  const params = new URLSearchParams({ method });
  if (materialId) params.set("material", materialId);
  return `${routes.study}?${params.toString()}`;
}

/** Ranked list of what to do next, derived from mastery, confidence, due reviews, mistakes and flashcards. */
export const getRecommendations = cache(async (limit = 4): Promise<Recommendation[]> => {
  const [summary, dueCards, openMistakes] = await Promise.all([getMasterySummary(), countDueCards(), countOpenMistakes()]);
  const items: Recommendation[] = [];

  if (summary.misconceptions.length > 0) {
    const top = summary.misconceptions[0];
    items.push({
      id: "misconception",
      title: `Clear up ${label(top)}`,
      reason: `You answered ${top.misconceptions} ${label(top)} question${top.misconceptions === 1 ? "" : "s"} wrong while feeling confident — a sign of a misconception rather than a memory gap. Explaining it in your own words exposes the faulty idea.`,
      method: "feynman",
      minutes: 15,
      href: sessionHref("feynman", top.concept?.material_id ?? null),
      priority: 100,
      concepts: [label(top)],
      materialId: top.concept?.material_id ?? null,
    });
  }

  if (summary.weak.length > 0) {
    const names = summary.weak.slice(0, 3).map(label);
    const top = summary.weak[0];
    items.push({
      id: "weak",
      title: `Active recall on ${names[0]}`,
      reason: `${names[0]} is at ${Math.round(Number(top.mastery))}% mastery (${top.correct} of ${top.attempts} correct)${names.length > 1 ? `, and ${names.slice(1).join(" and ")} ${names.length === 2 ? "is" : "are"} weak too` : ""}. Retrieving the answer from memory is the fastest way to move it up.`,
      method: "active_recall",
      minutes: 10,
      href: sessionHref("active_recall", materialOf(summary.weak)),
      priority: 90,
      concepts: names,
      materialId: materialOf(summary.weak),
    });
  }

  if (openMistakes > 0) {
    items.push({
      id: "mistakes",
      title: `Retest ${openMistakes} open mistake${openMistakes === 1 ? "" : "s"}`,
      reason: "Mistakes you have not retested yet keep lowering the mastery of their concepts. A correct retest marks them learned.",
      method: "error_review",
      minutes: Math.min(20, Math.max(5, openMistakes * 2)),
      href: sessionHref("error_review", null),
      priority: 80,
      concepts: [],
      materialId: null,
    });
  }

  if (summary.dueForReview.length > 0) {
    const names = summary.dueForReview.slice(0, 3).map(label);
    items.push({
      id: "due",
      title: `Refresh ${names[0]} before it fades`,
      reason: `Retrieval strength for ${names.join(", ")} has dropped below the review line; a short recall session now costs far less than relearning later.`,
      method: "active_recall",
      minutes: 10,
      href: sessionHref("active_recall", materialOf(summary.dueForReview)),
      priority: 70,
      concepts: names,
      materialId: materialOf(summary.dueForReview),
    });
  }

  if (dueCards > 0) {
    items.push({
      id: "cards",
      title: `Review ${dueCards} due flashcard${dueCards === 1 ? "" : "s"}`,
      reason: "Spaced repetition only works when due cards are reviewed on time; this keeps the schedule honest.",
      method: "spaced_repetition",
      minutes: Math.min(20, Math.max(5, Math.ceil(dueCards / 4))),
      href: `${routes.flashcards}/review`,
      priority: 60,
      concepts: [],
      materialId: null,
    });
  }

  if (summary.underconfident.length > 0) {
    const top = summary.underconfident[0];
    items.push({
      id: "underconfident",
      title: `Build confidence in ${label(top)}`,
      reason: `You got ${label(top)} right ${top.underconfident} time${top.underconfident === 1 ? "" : "s"} while feeling unsure. A timed practice test shows you that you know it.`,
      method: "practice_testing",
      minutes: 15,
      href: sessionHref("practice_testing", top.concept?.material_id ?? null),
      priority: 50,
      concepts: [label(top)],
      materialId: top.concept?.material_id ?? null,
    });
  }

  if (summary.total > 0 && summary.weak.length === 0 && summary.learning.length === 0) {
    items.push({
      id: "exam",
      title: "Confirm it under exam conditions",
      reason: `Every concept you have practised is strong or mastered (average ${summary.averageMastery}%). An exam simulation checks that it holds with a timer and no hints.`,
      method: "practice_testing",
      minutes: 30,
      href: sessionHref("practice_testing", materialOf([...summary.strong, ...summary.mastered])),
      priority: 40,
      concepts: [],
      materialId: materialOf([...summary.strong, ...summary.mastered]),
    });
  }

  if (items.length === 0) {
    items.push({
      id: "start",
      title: "Start with a short active recall session",
      reason: "RevTaw has no answers from you yet. One short session on a material gives it the first concepts to track.",
      method: "active_recall",
      minutes: 10,
      href: sessionHref("active_recall", null),
      priority: 10,
      concepts: [],
      materialId: null,
    });
  }

  return items.sort((a, b) => b.priority - a.priority).slice(0, limit);
});
