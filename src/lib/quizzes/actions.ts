"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { refreshMastery } from "@/lib/adaptive/engine";
import { ServiceError } from "@/lib/errors";
import { saveAnswer, selfGradeAnswer, startAttempt, submitAttempt, type SaveAnswerResult } from "@/lib/quizzes/service";
import { routes } from "@/lib/routes";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type QuizActionResult<T = undefined> = ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T })) | { ok: false; message: string };

const uuid = z.uuid();

function revalidateQuiz(quizId?: string, attemptId?: string) {
  revalidatePath(routes.quiz);
  revalidatePath(routes.dashboard);
  if (quizId) revalidatePath(`${routes.quiz}/${quizId}`);
  if (quizId && attemptId) revalidatePath(`${routes.quiz}/${quizId}/attempt/${attemptId}`);
}

function failure(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof ServiceError) return { ok: false, message: error.message };
  console.error(fallback, error);
  return { ok: false, message: fallback };
}

const startSchema = z.object({
  quizId: uuid,
  mode: z.enum(["practice", "exam"]),
  timeLimitMinutes: z.number().int().min(1).max(240).nullable(),
});

/** Starts a new attempt and sends the student to the runner. */
export async function startAttemptAction(input: z.input<typeof startSchema>): Promise<QuizActionResult<{ attemptId: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose a mode and a valid time limit." };
  try {
    const { id } = await startAttempt(parsed.data.quizId, { mode: parsed.data.mode, timeLimitMinutes: parsed.data.timeLimitMinutes });
    revalidateQuiz(parsed.data.quizId);
    return { ok: true, data: { attemptId: id } };
  } catch (error) {
    return failure(error, "The attempt could not be started.");
  }
}

const answerSchema = z.object({
  attemptId: uuid,
  questionId: uuid,
  response: z.unknown(),
  confidence: z.enum(["guessing", "unsure", "somewhat_confident", "very_confident"]).nullable(),
  responseMs: z.number().int().min(0).max(86_400_000).nullable(),
});

/** Saves (and, when the quiz gives immediate feedback, grades) one answer. */
export async function answerQuestionAction(input: z.input<typeof answerSchema>): Promise<QuizActionResult<SaveAnswerResult>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That answer could not be saved." };
  try {
    const result = await saveAnswer({
      attemptId: parsed.data.attemptId,
      questionId: parsed.data.questionId,
      response: parsed.data.response ?? null,
      confidence: parsed.data.confidence,
      responseMs: parsed.data.responseMs,
    });
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "That answer could not be saved. Check your connection and try again.");
  }
}

/** Submits the attempt and returns the student to the results view. */
export async function submitAttemptAction(input: { attemptId: string; quizId: string }): Promise<QuizActionResult<{ needsSelfCheck: number }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ attemptId: uuid, quizId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid attempt." };
  try {
    const result = await submitAttempt(parsed.data.attemptId);
    revalidateQuiz(parsed.data.quizId, parsed.data.attemptId);
    return { ok: true, data: { needsSelfCheck: result.needsSelfCheck } };
  } catch (error) {
    return failure(error, "The quiz could not be submitted. Please try again.");
  }
}

export async function selfGradeAction(input: { answerId: string; quizId: string; attemptId: string; verdict: "correct" | "partial" | "incorrect" }): Promise<QuizActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z
    .object({ answerId: uuid, quizId: uuid, attemptId: uuid, verdict: z.enum(["correct", "partial", "incorrect"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid answer." };
  try {
    await selfGradeAnswer(parsed.data.answerId, parsed.data.verdict);
    revalidateQuiz(parsed.data.quizId, parsed.data.attemptId);
    revalidatePath(`${routes.quiz}/mistakes`);
    return { ok: true };
  } catch (error) {
    return failure(error, "The answer could not be checked.");
  }
}

export async function renameQuizAction(quizId: string, title: string): Promise<QuizActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ quizId: uuid, title: z.string().trim().min(1).max(160) }).safeParse({ quizId, title });
  if (!parsed.success) return { ok: false, message: "Enter a title of up to 160 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("quizzes").update({ title: parsed.data.title }).eq("id", parsed.data.quizId);
  if (error) return { ok: false, message: "The title could not be saved." };
  revalidateQuiz(parsed.data.quizId);
  return { ok: true };
}

export async function deleteQuizAction(quizId: string): Promise<QuizActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = uuid.safeParse(quizId);
  if (!parsed.success) return { ok: false, message: "Invalid quiz." };
  const supabase = await createClient();
  const { error } = await supabase.from("quizzes").delete().eq("id", parsed.data);
  if (error) return { ok: false, message: "The quiz could not be deleted." };
  revalidateQuiz();
  return { ok: true };
}

const mistakeUpdateSchema = z.object({
  mistakeId: uuid,
  resolved: z.boolean().optional(),
  errorType: z
    .enum(["misunderstood_concept", "forgotten_information", "calculation_error", "misread_question", "confused_concepts", "unclassified"])
    .optional(),
});

/** Marks a mistake resolved/open or records what kind of error it was. */
export async function updateMistakeAction(input: z.input<typeof mistakeUpdateSchema>): Promise<QuizActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = mistakeUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid update." };
  const supabase = await createClient();
  const patch: { resolved_at?: string | null; error_type?: z.infer<typeof mistakeUpdateSchema>["errorType"] } = {};
  if (parsed.data.resolved !== undefined) patch.resolved_at = parsed.data.resolved ? new Date().toISOString() : null;
  if (parsed.data.errorType) patch.error_type = parsed.data.errorType;
  const { data, error } = await supabase.from("mistakes").update(patch).eq("id", parsed.data.mistakeId).select("concept_id").maybeSingle();
  if (error) return { ok: false, message: "The mistake could not be updated." };
  if (data?.concept_id && parsed.data.resolved !== undefined) await refreshMastery([data.concept_id]);
  revalidatePath(`${routes.quiz}/mistakes`);
  revalidatePath(routes.dashboard);
  return { ok: true };
}
