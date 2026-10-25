import "server-only";

import { unstable_rethrow } from "next/navigation";

import { getMasterySummary } from "@/lib/adaptive/engine";
import { getDueToday, getNextExam } from "@/lib/planner/queries";
import { plannerClock } from "@/lib/planner/service";
import { countOpenMistakes } from "@/lib/quizzes/queries";
import { createClient } from "@/lib/supabase/server";

const clip = (value: string | null | undefined, length = 80) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};
const count = (value: number, word: string) => `${value} ${word}${value === 1 ? "" : "s"}`;

/** The latest open mistakes: what was asked, and the concept when there is one. */
async function latestMistakes(): Promise<Array<{ question: string; concept: string | null }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mistakes")
    .select("question_text, concept:concepts!mistakes_concept_fk(name)")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(3);
  return (data ?? []).map((row) => ({ question: row.question_text, concept: (row.concept as { name: string } | null)?.name ?? null }));
}

/**
 * A short, factual note of where the student stands (weakest concepts, what
 * is due today, the next exam, open mistakes and the latest ones), sent with
 * every question so Tamari can answer "what should I study today?" or "quiz
 * me on my weak spots" and pitch an explanation from what RevTaw knows. Read
 * with the student's session (RLS); best effort — a failure just means no
 * note.
 */
export async function studySnapshot(): Promise<string | null> {
  try {
    const [summary, due, exam, mistakes, latest, clock] = await Promise.all([getMasterySummary(), getDueToday(), getNextExam(), countOpenMistakes(), latestMistakes(), plannerClock()]);
    const weakest = [...summary.weak, ...summary.learning].sort((a, b) => Number(a.mastery) - Number(b.mastery)).slice(0, 6);
    const open = due.tasks.filter((task) => task.status !== "done" && task.status !== "skipped");
    const lines = [
      weakest.length
        ? `Weakest concepts: ${weakest.map((row) => `${clip(row.concept?.name ?? "concept")} (${Math.round(Number(row.mastery))}%${row.concept?.material?.title ? `, in "${clip(row.concept.material.title, 60)}"` : ""})`).join("; ")}.`
        : summary.total === 0
          ? "No practice tracked yet, so there are no weak concepts to report."
          : "No weak concepts right now.",
      `Today (${clock.today}): ${count(open.length, "planned task")}${open.length ? ` (${open.slice(0, 5).map((task) => `${clip(task.title, 60)}, ${task.minutes} min`).join("; ")})` : ""}, ${count(due.dueCards, "flashcard")} due, ${count(due.overdueCount, "overdue task")}${due.dueConcepts.length ? `, concepts fading: ${due.dueConcepts.slice(0, 5).map((concept) => clip(concept.name, 50)).join(", ")}` : ""}.`,
      exam ? `Next exam: "${clip(exam.title, 80)}" on ${exam.exam_date} (${count(exam.daysLeft, "day")} left${exam.readiness !== null ? `, readiness ${exam.readiness}%` : ""}).` : "No upcoming exam.",
      `Open mistakes in the mistake notebook: ${mistakes}${latest.length ? ` (latest: ${latest.map((item) => `"${clip(item.question, 90)}"${item.concept ? ` on ${clip(item.concept, 40)}` : ""}`).join("; ")})` : ""}.`,
    ];
    return `The student's study data in RevTaw right now:\n- ${lines.join("\n- ")}`;
  } catch (error) {
    unstable_rethrow(error);
    console.error("assistant: study snapshot failed", error);
    return null;
  }
}
