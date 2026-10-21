import "server-only";

import { getMasterySummary } from "@/lib/adaptive/engine";
import type { PageContextRef } from "@/lib/assistant/context-schema";
import { getExam } from "@/lib/planner/queries";
import { getAttemptResults } from "@/lib/quizzes/queries";
import { REVIEWER_KIND_BY_ID } from "@/lib/reviewers/kinds";
import { methodName } from "@/lib/study/catalog";
import { createClient } from "@/lib/supabase/server";

/**
 * Turns a page context reference into what the tutor needs: the material to
 * ground answers in and a short, factual note about the page. Everything is
 * read with the student's session (RLS); a foreign or unknown id simply
 * yields no context.
 */
export type ResolvedPageContext = { materialId: string | null; note: string | null };

const NONE: ResolvedPageContext = { materialId: null, note: null };
const clip = (value: string | null | undefined, length: number) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

export async function resolvePageContext(ref: PageContextRef | null): Promise<ResolvedPageContext> {
  if (!ref) return NONE;
  try {
    const supabase = await createClient();
    switch (ref.kind) {
      case "material": {
        const { data } = await supabase.from("materials").select("id, title, subject:subjects!materials_subject_fk(name)").eq("id", ref.id).maybeSingle();
        if (!data) return NONE;
        const subject = (data.subject as unknown as { name: string } | null)?.name;
        return { materialId: data.id, note: `The student has the material "${clip(data.title, 160)}"${subject ? ` (${clip(subject, 80)})` : ""} open.` };
      }
      case "reviewer": {
        const [{ data: reviewer }, { data: sections }] = await Promise.all([
          supabase.from("reviewers").select("id, title, kind, material_id").eq("id", ref.id).maybeSingle(),
          supabase.from("reviewer_sections").select("heading").eq("reviewer_id", ref.id).order("position").limit(14),
        ]);
        if (!reviewer) return NONE;
        const headings = (sections ?? []).map((section) => clip(section.heading, 80)).filter(Boolean);
        return {
          materialId: reviewer.material_id,
          note: `The student is reading their ${REVIEWER_KIND_BY_ID[reviewer.kind]?.name ?? "reviewer"} "${clip(reviewer.title, 160)}"${headings.length ? `, with sections: ${headings.join("; ")}` : ""}.`,
        };
      }
      case "attempt": {
        const results = await getAttemptResults(ref.id);
        if (!results) return NONE;
        if (results.attempt.status !== "submitted") {
          return {
            materialId: results.quiz.material_id,
            note: `The student is taking the quiz "${clip(results.quiz.title, 160)}" right now. Do not reveal answers or say which option is correct for any of its questions; help with the underlying ideas only.`,
          };
        }
        const lines = results.questions.slice(0, 30).map((question, index) => {
          const verdict = question.isCorrect === true ? "correct" : question.isCorrect === false ? "wrong" : question.studentAnswer ? "not graded yet" : "unanswered";
          return `#${index + 1} [${verdict}] ${clip(question.prompt, 220)} | student: ${clip(question.studentAnswer ?? "(no answer)", 160)} | correct: ${clip(question.correctAnswer, 160)}${question.explanation ? ` | why: ${clip(question.explanation, 200)}` : ""}`;
        });
        return {
          materialId: results.quiz.material_id,
          note: `The student is looking at the results of the quiz "${clip(results.quiz.title, 160)}": ${results.attempt.correct_count ?? 0} of ${results.attempt.question_count} correct. Questions are numbered as the student saw them:\n${lines.join("\n")}`,
        };
      }
      case "deck": {
        const { data } = await supabase.from("flashcard_decks").select("id, title, card_count, material_id").eq("id", ref.id).maybeSingle();
        if (!data) return NONE;
        return { materialId: data.material_id, note: `The student is looking at the flashcard deck "${clip(data.title, 160)}" (${data.card_count} cards).` };
      }
      case "exam": {
        const exam = await getExam(ref.id);
        if (!exam) return NONE;
        return {
          materialId: exam.materials[0]?.id ?? null,
          note: `The student is looking at their exam "${clip(exam.title, 160)}" on ${exam.exam_date} (${exam.daysLeft} days left)${exam.topics.length ? `, topics: ${exam.topics.slice(0, 12).map((topic) => clip(topic, 60)).join(", ")}` : ""}${exam.readiness !== null ? `, readiness ${exam.readiness}%` : ""}.`,
        };
      }
      case "session": {
        const { data } = await supabase.from("study_sessions").select("id, title, method, status, material_id").eq("id", ref.id).maybeSingle();
        if (!data) return NONE;
        const active = data.status === "in_progress";
        return {
          materialId: data.material_id,
          note: `The student is in the study session "${clip(data.title, 160)}" (${methodName(data.method)})${active ? ". It is still running: do not give away the answers to its prompts before the student has tried them; hints and explanations of ideas are fine." : ", which is finished."}`,
        };
      }
      case "progress": {
        const summary = await getMasterySummary();
        const weak = [...summary.weak, ...summary.learning].sort((a, b) => Number(a.mastery) - Number(b.mastery)).slice(0, 8);
        if (weak.length === 0) return { materialId: null, note: "The student is on their progress page; no weak concepts right now." };
        return {
          materialId: weak[0].concept?.material_id ?? null,
          note: `The student is on their progress page. Weakest concepts: ${weak.map((row) => `${clip(row.concept?.name ?? "concept", 60)} (${Math.round(Number(row.mastery))}%)`).join(", ")}.`,
        };
      }
    }
  } catch (error) {
    console.error("assistant: page context failed", error);
  }
  return NONE;
}
