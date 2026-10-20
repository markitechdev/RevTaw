import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import type { AiMessage } from "@/lib/ai/types";
import type { StudentContext } from "@/lib/materials/analyze";
import { EDUCATION_LEVEL_LABEL, STUDY_GOAL_LABEL } from "@/lib/profile/options";
import type { TutorMode } from "@/lib/supabase/database.types";
import { labelChunk, type ContextChunk } from "@/lib/tutor/context";
import { flashcardDraftSchema, FOLLOW_UP_IDS, sourceSchema, TUTOR_ACTION_BY_ID, type TutorActionId } from "@/lib/tutor/types";

export const tutorReplySchema = z.object({
  answer: z.string().trim().min(1).max(6000),
  grounding: z.enum(["material", "partial", "general", "not_found"]),
  sources: z.array(sourceSchema).max(6).default([]),
  additional_explanation: z.string().trim().max(2000).nullable().default(null),
  follow_ups: z.array(z.enum(FOLLOW_UP_IDS)).max(5).default([]),
  flashcard: flashcardDraftSchema.nullable().default(null),
});

export type TutorReply = z.infer<typeof tutorReplySchema>;

function studentLine(student: StudentContext): string {
  return (
    [
      student.educationLevel ? `education level: ${EDUCATION_LEVEL_LABEL[student.educationLevel]}` : null,
      student.mainGoal ? `main goal: ${STUDY_GOAL_LABEL[student.mainGoal]}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "not specified"
  );
}

const MODE_RULES: Record<TutorMode, string> = {
  tutor:
    "Default behaviour: give the shortest clear, direct answer first (one to four sentences), then at most one short paragraph of support. Offer follow-ups instead of writing everything at once.",
  guided:
    "Guided mode: do NOT give the final answer. Give a hint, the first step, or a leading question that moves the student forward; if they are stuck after several turns, reveal one more step at a time. Confirm when they reach the answer themselves.",
  socratic:
    "Socratic mode: respond mainly with questions that probe the student's reasoning (What makes you think that? What evidence supports it? Is there another explanation? What assumption are you making? What if the opposite were true?). Acknowledge correct reasoning briefly, correct false statements gently, but never hand over the full answer; one or two questions per turn.",
  elaborative:
    "Elaborative interrogation mode: push the student to explain causes and reasons: Why is this true? Why does it happen? What causes it? Why is it important? What changes if a condition changes? Evaluate the reasoning they give, point out gaps, and ask the next why.",
  self_explanation:
    "Self-explanation mode: walk through a worked solution or process from the material one step at a time. Present a step, ask the student to explain why it works or what should happen next, evaluate their reasoning (not just the final answer), then continue.",
  teach_back:
    "Teach-back mode: YOU are the learner and the student is the teacher. Ask the student to teach you a concept from the material, listen, and ask the questions a curious beginner would ask whenever the explanation is unclear, skips a step or contradicts the material (What do you mean by…? Why does that happen? Can you give an example? How is that different from…?). Never lecture; at most one short clarification per turn, then another learner question. Keep track of what the student has explained well and what is still missing.",
};

const ACTION_RULES: Partial<Record<TutorActionId, string>> = {
  explain: "Explain the highlighted idea clearly and briefly.",
  simplify: "Rewrite the idea in the simplest possible words, short sentences, no jargon.",
  summarize: "Summarize in three to five bullet points.",
  example: "Give one concrete, worked example; prefer examples from the material and label any added example as general.",
  analogy: "Give an analogy, then clearly separate 'Analogy' from 'Actual definition' so the analogy never replaces the precise meaning.",
  step_by_step: "Explain step by step as a numbered list, one idea per step.",
  quiz: "Ask ONE question about the material (no answer yet), then wait for the student's reply; on the next turn grade their answer against the material.",
  guide: "Give a hint or leading question only; do not reveal the answer.",
  why: "Ask 'why' about the claim; give the first why-answer from the material and end with the next why question for the student.",
  compare: "Compare the idea with the related concepts in the material: similarities, differences, when each applies.",
  mnemonic: "Propose a mnemonic (acronym, rhyme or short story) for the list or sequence, then restate what each part stands for.",
  beginner: "Explain as if to a complete beginner: everyday words, one idea at a time, a tiny example.",
  why_wrong: "Explain why the student's answer is wrong and what the correct reasoning is, kindly and specifically.",
  explain_more: "Expand the previous answer with more depth and a second example.",
};

export type TutorTurnInput = {
  mode: TutorMode;
  materialTitle: string | null;
  context: ContextChunk[];
  truncated: boolean;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
  action: TutorActionId | null;
  selection: string | null;
  student: StudentContext;
};

export async function tutorReply(input: TutorTurnInput): Promise<{ reply: TutorReply; provider: string; model: string }> {
  const provider = getAiProvider(input.mode === "tutor" ? "fast" : "strong");
  const transcript = input.context.map((chunk) => `${labelChunk(chunk)}\n${chunk.content}`).join("\n\n");

  const system = `You are RevTaw's AI tutor, a calm and encouraging study assistant for one student.

Grounding rules (most important):
- When the student asks about their uploaded material, answer from the <material> passages first. Set "grounding" to "material" when the answer is fully supported by them, "partial" when you add general knowledge, "general" when the material does not cover the topic but you can still explain it, and "not_found" when you cannot answer from the material and it is a question about the material.
- "sources": the passages you relied on, with the section position from the label, its heading, pages if shown, and a SHORT verbatim quote (max 200 chars). Never invent quotes, page numbers, formulas, definitions or citations. If nothing applies, leave it empty.
- "additional_explanation": anything that comes from general knowledge rather than the material, so the student can tell the two apart; null when everything is from the material.
- When the material does not contain enough information, say so plainly ("I couldn't verify this from your uploaded material.") before any general explanation.

Style:
- ${MODE_RULES[input.mode]}
- Write for the student directly in plain language. Keep the material's terminology. Use simple markdown only: paragraphs, "-" bullets, "1." numbered steps, **bold**, \`code\` for formulas. No headings, tables or links.
- "follow_ups": up to 4 of explain_more, example, simplify, analogy, test_me, add_to_notes, create_flashcard that make sense next.
- "flashcard": when the answer contains one memorable fact, propose a front/back card for it; otherwise null.
- Respond with a single JSON object matching the schema. No commentary.`;

  const action = input.action ? ACTION_RULES[input.action] : null;
  const user = [
    `Material: ${input.materialTitle ?? "(no material selected — answer from general knowledge and set grounding to \"general\")"}`,
    `Student: ${studentLine(input.student)}`,
    input.truncated ? "Note: only the most relevant passages of a longer material are included." : null,
    input.selection ? `Highlighted text the student selected:\n"""\n${input.selection.slice(0, 4000)}\n"""` : null,
    action ? `Requested action: ${TUTOR_ACTION_BY_ID[input.action!].label} — ${action}` : null,
    `Student message: ${input.message.slice(0, 6000)}`,
    `JSON schema: { "answer": string, "grounding": "material" | "partial" | "general" | "not_found", "sources": [{ "position": number, "heading": string | null, "pages": string | null, "quote": string }], "additional_explanation": string | null, "follow_ups": string[], "flashcard": { "front": string, "back": string } | null }`,
    transcript ? `<material>\n${transcript}\n</material>` : "<material>\n(none)\n</material>",
  ]
    .filter(Boolean)
    .join("\n\n");

  const history: AiMessage[] = input.history.slice(-12).map((turn) => ({ role: turn.role, content: turn.content.slice(0, 3000) }));
  const messages: AiMessage[] = [...history, { role: "user", content: user }];

  const result = await generateJson(provider, tutorReplySchema, {
    task: "tutor_reply",
    system,
    messages,
    maxTokens: 2500,
    temperature: 0.3,
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
