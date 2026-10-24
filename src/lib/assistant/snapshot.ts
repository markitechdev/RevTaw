import "server-only";

import { unstable_rethrow } from "next/navigation";

import { getMasterySummary } from "@/lib/adaptive/engine";
import { getDueToday, getNextExam } from "@/lib/planner/queries";
import { plannerClock } from "@/lib/planner/service";
import { countOpenMistakes } from "@/lib/quizzes/queries";

const clip = (value: string | null | undefined, length = 80) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};
const count = (value: number, word: string) => `${value} ${word}${value === 1 ? "" : "s"}`;

/**
 * A short, factual note of the student's own study data (weakest concepts,
 * what is due today, the next exam, open mistakes), so Tamari can answer
 * "what am I weak at?" or "what should I study today?" from what RevTaw
 * knows. Read with the student's session (RLS); best effort — a failure just
 * means no note.
 */
export async function studySnapshot(): Promise<string | null> {
  try {
    const [summary, due, exam, mistakes, clock] = await Promise.all([getMasterySummary(), getDueToday(), getNextExam(), countOpenMistakes(), plannerClock()]);
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
      `Open mistakes in the mistake notebook: ${mistakes}.`,
    ];
    return `The student's study data in RevTaw right now:\n- ${lines.join("\n- ")}`;
  } catch (error) {
    unstable_rethrow(error);
    console.error("assistant: study snapshot failed", error);
    return null;
  }
}
