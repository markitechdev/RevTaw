import "server-only";

import { cache } from "react";

import { getMasterySummary, type MasteryView } from "@/lib/adaptive/engine";
import { methodFor, rankConcepts, type RankedConcept } from "@/lib/adaptive/focus";
import { ENGINE } from "@/lib/engine/config";
import { countDueCards } from "@/lib/flashcards/queries";
import { countOpenMistakes } from "@/lib/quizzes/queries";
import { routes } from "@/lib/routes";
import { BUILDER_METHOD_IDS, methodName } from "@/lib/study/catalog";
import type { StudyMethodId } from "@/lib/study/methods";

/**
 * Recommendations with reasons (spec §22 "RevTaw recommendation", §28
 * "determine what appears next", §15 "recommendations should include a
 * short explanation of why the method was selected"). Concepts are ranked by
 * the learning engine's priority and each gets the rule table's method
 * (research doc §10–§11); open mistakes, due cards and confidence follow.
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
  if (method === "spaced_repetition" || method === "flashcards") return `${routes.flashcards}/review`;
  const params = new URLSearchParams({ method });
  if (materialId) params.set("material", materialId);
  return `${routes.study}?${params.toString()}`;
}

/** Recommendations can start any session the study builder runs, except Tamari's own plan. */
const STARTABLE: ReadonlySet<StudyMethodId> = new Set(BUILDER_METHOD_IDS.filter((id) => id !== "smart_study"));
const RECOMMENDED_MINUTES = 15;

/** Where a concept stands, in one sentence. */
function standing(concept: RankedConcept): string {
  const exam = concept.daysToExam === null ? "" : concept.daysToExam <= 0 ? " Its exam is today." : concept.daysToExam === 1 ? " Its exam is tomorrow." : ` Its exam is in ${concept.daysToExam} days.`;
  if (!concept.row) return `You haven't studied ${concept.name} yet.${exam}`;
  const row = concept.row;
  const recall = row.recall !== null && Number(row.recall) < ENGINE.fsrs.retention ? `, and recall is down to ${Math.round(Number(row.recall) * 100)}%` : "";
  return `${concept.name} is at ${Math.round(Number(row.mastery))}% mastery (${row.correct} of ${row.attempts} right${recall}).${exam}`;
}

/** Ranked list of what to do next (research doc §10–§11): the top concepts by priority, each with the rule table's method and why. */
export const getRecommendations = cache(async (limit = 4): Promise<Recommendation[]> => {
  const [summary, ranked, dueCards, openMistakes] = await Promise.all([getMasterySummary(), rankConcepts({ includeUnpracticed: true }), countDueCards(), countOpenMistakes()]);
  const items: Recommendation[] = [];

  // The two highest-priority concepts, plus the worst open misconception: a confident error is fixed first.
  const top = ranked.filter((concept) => concept.parts.need > 0).slice(0, 2);
  const misconception = ranked.filter((concept) => (concept.row?.misconceptions ?? 0) > 0).sort((a, b) => b.row!.misconceptions - a.row!.misconceptions)[0];
  if (misconception && !top.some((concept) => concept.id === misconception.id)) top.push(misconception);
  top.forEach((concept, index) => {
    const pick = methodFor(concept, RECOMMENDED_MINUTES, { allowed: STARTABLE, dueCards: dueCards > 0 });
    const confident = concept.row?.misconceptions ?? 0;
    items.push({
      id: `concept:${concept.id}`,
      title: confident > 0 ? `Clear up ${concept.name}` : concept.row ? `${methodName(pick.method)} for ${concept.name}` : `Start ${concept.name} with ${methodName(pick.method)}`,
      reason:
        confident > 0
          ? `You answered ${confident} ${concept.name} question${confident === 1 ? "" : "s"} wrong while feeling confident — a sign of a misconception rather than a memory gap. ${pick.reason}`
          : `${standing(concept)} ${pick.reason}`,
      method: pick.method,
      minutes: RECOMMENDED_MINUTES,
      href: sessionHref(pick.method, concept.materialId),
      priority: confident > 0 ? 100 : 95 - index * 5,
      concepts: [concept.name],
      materialId: concept.materialId,
    });
  });
  const shown = new Set(top.map((concept) => concept.name));

  if (openMistakes > 0) {
    items.push({
      id: "mistakes",
      title: `Retest ${openMistakes} open mistake${openMistakes === 1 ? "" : "s"}`,
      reason: "A retest shows whether each one is fixed. Until then they count toward their concepts' weak-topic score; a correct retest marks them learned.",
      method: "error_review",
      minutes: Math.min(20, Math.max(5, openMistakes * 2)),
      href: sessionHref("error_review", null),
      priority: 80,
      concepts: [],
      materialId: null,
    });
  }

  const fading = summary.dueForReview.filter((row) => !shown.has(label(row)));
  if (fading.length > 0) {
    const names = fading.slice(0, 3).map(label);
    items.push({
      id: "due",
      title: `Refresh ${names[0]} before it fades`,
      reason: `Recall of ${names.join(", ")} has dropped below 90%; a short recall session now costs far less than relearning later.`,
      method: "active_recall",
      minutes: 10,
      href: sessionHref("active_recall", materialOf(fading)),
      priority: 70,
      concepts: names,
      materialId: materialOf(fading),
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

  if (summary.total > 0 && summary.needsWork.length === 0 && summary.weak.length === 0 && summary.learning.length === 0 && summary.developing.length === 0) {
    items.push({
      id: "exam",
      title: "Confirm it under exam conditions",
      reason: `Every concept you have practiced is strong or mastered (average ${summary.averageMastery}%). An exam simulation checks that it holds with a timer and no hints.`,
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
