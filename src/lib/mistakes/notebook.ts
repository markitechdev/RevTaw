import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, MistakeType } from "@/lib/supabase/database.types";
import { clampText } from "@/lib/text/clamp";

type Client = SupabaseClient<Database>;

/** Longest text kept per field (the columns allow more; the notebook shows a question, not an essay). */
const TEXT_MAX = 4000;

export type NewMistake = {
  userId: string;
  conceptId: string | null;
  materialId: string | null;
  question: string;
  studentAnswer: string | null;
  correctAnswer: string;
  explanation: string | null;
  errorType?: MistakeType;
  /** A quiz question: the notebook keeps one entry per question per attempt (migration 0028). */
  quiz?: { attemptId: string; questionId: string };
};

/**
 * Adds a wrong answer to the student's mistake notebook. The one place entries are made, with one rule
 * against doubles: a quiz question has one entry per attempt (a repeat keeps the first, by the unique index
 * of migration 0028), and a study item adds one entry because only the request that stored its answer
 * settles it. A failed retest of a notebook entry adds nothing; the entry stays open.
 */
export async function addMistake(supabase: Client, mistake: NewMistake): Promise<void> {
  const row = {
    user_id: mistake.userId,
    concept_id: mistake.conceptId,
    material_id: mistake.materialId,
    question_text: clampText(mistake.question, TEXT_MAX),
    student_answer: mistake.studentAnswer ? clampText(mistake.studentAnswer, TEXT_MAX) : null,
    correct_answer: clampText(mistake.correctAnswer, TEXT_MAX) || "(see the session)",
    explanation: mistake.explanation ? clampText(mistake.explanation, TEXT_MAX) : null,
    error_type: mistake.errorType ?? "unclassified",
  };
  const { error } = mistake.quiz
    ? await supabase.from("mistakes").upsert({ ...row, attempt_id: mistake.quiz.attemptId, question_id: mistake.quiz.questionId }, { onConflict: "attempt_id,question_id", ignoreDuplicates: true })
    : await supabase.from("mistakes").insert(row);
  if (error) console.error("mistakes: save failed", error.message);
}

/** Marks a notebook entry learned: the student got it right on a retest. */
export async function resolveMistake(supabase: Client, mistakeId: string): Promise<void> {
  const { error } = await supabase.from("mistakes").update({ resolved_at: new Date().toISOString() }).eq("id", mistakeId).is("resolved_at", null);
  if (error) console.error("mistakes: resolve failed", error.message);
}

/** Takes a quiz question's entry out again: the student marked their answer correct against the model answer. */
export async function removeQuizMistake(supabase: Client, quiz: { attemptId: string; questionId: string }): Promise<void> {
  const { error } = await supabase.from("mistakes").delete().eq("attempt_id", quiz.attemptId).eq("question_id", quiz.questionId);
  if (error) console.error("mistakes: remove failed", error.message);
}
