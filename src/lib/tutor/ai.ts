import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import type { TutorMode } from "@/lib/supabase/database.types";
import { tidyVisual, visualSchema } from "@/lib/study/prompts/visual";
import { buildTutorPrompt, type TutorPromptInput } from "@/lib/tutor/prompt";
import { flashcardDraftSchema, sourceSchema } from "@/lib/tutor/schemas";
import { isFollowUpId, type TutorActionId } from "@/lib/tutor/types";

/**
 * Tamari's reply. Only the answer is required: a model that adds an unknown follow-up, a malformed source or a
 * wrong label still has a usable answer, so those fields fall back instead of failing the whole reply.
 */
export const tutorReplySchema = z.object({
  answer: z.string().trim().min(1).max(12_000),
  grounding: z.enum(["material", "partial", "general", "not_found", "conversation"]).catch("general"),
  sources: z
    .array(z.unknown())
    .catch([])
    .default([])
    .transform((items) => items.flatMap((item) => {
      const parsed = sourceSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }).slice(0, 6)),
  additional_explanation: z.string().trim().max(2000).nullable().catch(null).default(null),
  follow_ups: z
    .array(z.unknown())
    .catch([])
    .default([])
    .transform((ids) => [...new Set(ids.filter(isFollowUpId))].slice(0, 5)),
  flashcard: flashcardDraftSchema.nullable().catch(null).default(null),
  // "Visualize": one dual-coding visual of the highlighted content (§20).
  visual: visualSchema.nullable().optional().catch(null).transform((value) => (value ? tidyVisual(value) : null)),
});

export type TutorReply = z.infer<typeof tutorReplySchema>;

export type TutorTurnInput = TutorPromptInput;

/** Output budgets: a short answer by default, room for a full lesson when the student asks for depth. */
const TUTOR_MAX_OUTPUT_TOKENS = 1_500;
const TUTOR_LONG_OUTPUT_TOKENS = 2_400;
const LONG_ANSWER = /\b(deep(ly)?|in detail|detailed|thorough(ly)?|whole (lesson|chapter|topic)|entire (lesson|chapter|topic)|teach me|full explanation|step by step|lahat|buong)\b/i;

export function wantsLongAnswer(message: string, action: TutorActionId | null): boolean {
  return action === "explain_more" || action === "step_by_step" || action === "visualize" || LONG_ANSWER.test(message);
}

export async function tutorReply(input: TutorTurnInput): Promise<{ reply: TutorReply; provider: string; model: string }> {
  // Tamari's replies (English, Filipino and Taglish) use the strong tier: gpt-oss-120b on Groq and Cloudflare.
  const provider = getAiProvider("strong");
  const { system, messages } = buildTutorPrompt(input);
  const result = await generateJson(provider, tutorReplySchema, {
    task: "tutor_reply",
    system,
    messages,
    maxTokens: wantsLongAnswer(input.message, input.action) ? TUTOR_LONG_OUTPUT_TOKENS : TUTOR_MAX_OUTPUT_TOKENS,
    // A little more variety when the student asked for a different answer.
    temperature: input.previousAttempt ? 0.6 : 0.3,
  });
  return { reply: result.data, provider: result.raw.provider, model: result.raw.model };
}

export const tutorEvaluationSchema = z.object({
  score: z.number().min(0).max(100),
  strengths: z.array(z.string().trim().min(1).max(300)).max(8),
  missing_concepts: z.array(z.string().trim().min(1).max(300)).max(8),
  suggestion: z.string().trim().min(1).max(600),
  concepts_covered: z.array(z.string().trim().min(1).max(120)).max(12),
});

export type TutorEvaluation = z.infer<typeof tutorEvaluationSchema>;

/** Closes a tutor-based study session with a teach-back style evaluation of the student's reasoning. */
export async function evaluateTutorSession(input: {
  mode: TutorMode;
  materialTitle: string | null;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ evaluation: TutorEvaluation; provider: string; model: string }> {
  const provider = getAiProvider("fast");
  const teachBack = input.mode === "teach_back";
  const system = `You are RevTaw's coach. A ${input.mode.replace("_", " ")} session about "${input.materialTitle ?? "a topic"}" just ended. ${teachBack ? "The STUDENT was teaching the AI learner. Grade the teaching: accuracy against the material, completeness, clarity and whether the learner's questions were answered." : "Evaluate the STUDENT's reasoning across the conversation (not the tutor's), kindly and specifically."}
- "score": 0-100 ${teachBack ? "teaching score (accuracy, completeness, clarity)" : "for accuracy and depth of the student's own explanations"}.
- "strengths": what they ${teachBack ? "explained well" : "reasoned well"}.
- "missing_concepts": ideas they skipped or got wrong.
- "suggestion": one concrete ${teachBack ? "improvement to the explanation" : "next step"}.
- "concepts_covered": the concepts discussed (1-4 words each).
Respond with JSON only.`;
  const user = input.history
    .slice(-30)
    .map((turn) => `${turn.role === "user" ? "Student" : "Tutor"}: ${turn.content.slice(0, 1500)}`)
    .join("\n\n");
  const result = await generateJson(provider, tutorEvaluationSchema, {
    task: "tutor_evaluate",
    system,
    messages: [{ role: "user", content: user || "Student: (no messages)" }],
    maxTokens: 1200,
    temperature: 0,
  });
  return { evaluation: result.data, provider: result.raw.provider, model: result.raw.model };
}
