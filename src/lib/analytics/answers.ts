import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** `graded`: the answers with a result (an answer not yet checked, or not yet marked by the student, has none). */
export type AnswerCounts = { answered: number; graded: number; correct: number };

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: value, error } = await query;
  if (error) console.error("answers: count failed", error.message);
  return value ?? 0;
}

/**
 * Every question the student has answered, in quizzes and in study
 * sessions, and how many were right: exact counts however many there are
 * (no rows are read). Progress's accuracy and the answer badges share them.
 */
export const getAnswerCounts = cache(async (): Promise<AnswerCounts> => {
  const supabase = await createClient();
  const [questions, gradedQuestions, correctQuestions, items, gradedItems, correctItems] = await Promise.all([
    // A quiz question left unanswered has a row (it scores 0) but no response: not an answer.
    count(supabase.from("quiz_answers").select("id", { count: "exact", head: true }).not("response", "is", null)),
    count(supabase.from("quiz_answers").select("id", { count: "exact", head: true }).not("response", "is", null).not("is_correct", "is", null)),
    count(supabase.from("quiz_answers").select("id", { count: "exact", head: true }).not("response", "is", null).eq("is_correct", true)),
    count(supabase.from("study_session_items").select("id", { count: "exact", head: true }).not("answered_at", "is", null)),
    count(supabase.from("study_session_items").select("id", { count: "exact", head: true }).not("answered_at", "is", null).not("is_correct", "is", null)),
    count(supabase.from("study_session_items").select("id", { count: "exact", head: true }).not("answered_at", "is", null).eq("is_correct", true)),
  ]);
  return { answered: questions + items, graded: gradedQuestions + gradedItems, correct: correctQuestions + correctItems };
});
