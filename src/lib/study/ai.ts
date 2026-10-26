import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { knownConceptsLine } from "@/lib/concepts/service";
import { buildTranscript, coverageNote, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import { RETRIEVAL_FORMATS, type RetrievalFormat } from "@/lib/study/formats";
import { points, studentLine, text, upTo } from "@/lib/study/prompts/shared";
import { PASS_SCORE, verdictFor, type Verdict } from "@/lib/study/verdict";
import { modelTitle } from "@/lib/ai/fields";

/**
 * Prompts behind the Phase 4 study methods. Every prompt is grounded in the
 * material transcript and returns validated JSON.
 */

// ---------------------------------------------------------------------------
// Active recall
// ---------------------------------------------------------------------------

export const recallQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        prompt: text(1000),
        model_answer: text(2000),
        key_points: points,
        concept: text(120),
        source_excerpt: z.string().trim().max(600).default(""),
        format: z.enum(RETRIEVAL_FORMATS).optional().catch(undefined),
      }),
    )
    .max(30),
});

export type RecallQuestion = z.infer<typeof recallQuestionsSchema>["questions"][number];

const FORMAT_RULES: Record<RetrievalFormat, string> = {
  short_answer: "a question answered in one or two sentences",
  definition: "ask for the definition of a term exactly as the material defines it",
  fill_blank: "a sentence from the material with one key term replaced by ____ (the model answer is the missing term)",
  explanation: "ask why or how something works; the answer is a short explanation",
  list: "ask for a list the material gives (steps, types, components); the model answer lists every item",
  example: "ask for an example the material gives, or ask the student to give an example that fits the material's definition",
  process: "ask the student to describe a process or sequence in order",
  calculation: "a small calculation or formula application using numbers or formulas stated in the material (if the material has none, use a process question instead)",
};

export async function generateRecallQuestions(input: {
  materialTitle: string;
  chunks: AnalysisChunkInput[];
  count: number;
  focusConcepts: string[];
  recentMistakes: string[];
  student: StudentContext;
  /** Retrieval practice: rotate through these formats and label each prompt. */
  formats?: RetrievalFormat[];
  /** Extra emphasis (rapid review: exam topics, important facts). */
  emphasis?: string[];
  /** The names the material's concepts already go by, to reuse. */
  knownConcepts?: string[];
  /** Questions the session asks anyway (rapid review's retested mistakes): the prompts must not ask them again. */
  alreadyAsked?: string[];
}): Promise<{ questions: RecallQuestion[]; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  // A long material leans toward the focus concepts; the rest keeps reading order.
  const { transcript, coverageRatio, focused } = buildTranscript(input.chunks, undefined, input.focusConcepts.length ? { text: input.focusConcepts.join(", "), share: 0.5 } : null);
  const formats = input.formats?.length ? input.formats : null;
  const system = `You are RevTaw's active-recall coach. You write recall prompts a student answers from memory before seeing the solution.

Rules:
- Each prompt asks for something the material states explicitly: a definition, a process, a reason, a formula, a comparison. No yes/no questions, no multiple choice.
- "model_answer": the answer in 1-3 sentences in the material's own words.
- "key_points": 2-5 short points a complete answer must contain (used to grade the student's answer).
- "concept": the 1-4 word concept being recalled (reuse the same wording for the same concept; when the message lists the material's concept names, a prompt on one of them uses that name, and only a concept not listed gets a new one).
- "source_excerpt": a short verbatim quote (max 300 chars) that supports the model answer.
- Cover different parts of the material; prioritize the focus concepts and recent mistakes when given.
- Never ask about a fact covered by a question listed under "Already asked" (when given): the student answers those separately.
${formats ? `- "format": rotate through these formats in order and label each prompt with the format it uses: ${formats.map((format) => `${format} (${FORMAT_RULES[format]})`).join("; ")}.\n` : ""}- Use ONLY the material between <material> tags.
- Respond with a single JSON object matching the schema. No commentary.`;
  const user = `Material title: ${input.materialTitle}
Student: ${studentLine(input.student)}
${input.focusConcepts.length ? `Focus concepts (weak for this student): ${input.focusConcepts.join(", ")}\n` : ""}${knownConceptsLine(input.knownConcepts ?? [])}${coverageNote(coverageRatio, focused)}${input.emphasis?.length ? `High-value topics to prioritize: ${input.emphasis.join(", ")}\n` : ""}${input.recentMistakes.length ? `Recent mistakes:\n${input.recentMistakes.map((item) => `- ${item}`).join("\n")}\n` : ""}${input.alreadyAsked?.length ? `Already asked:\n${input.alreadyAsked.map((item) => `- ${item}`).join("\n")}\n` : ""}${formats ? `Formats to rotate: ${formats.join(", ")}\n` : ""}
${upTo(input.count, "prompts")}

JSON schema: { "questions": [{ "prompt": string, "model_answer": string, "key_points": string[], "concept": string, "source_excerpt": string${formats ? ', "format": string' : ""} }] }

<material>
${transcript}
</material>`;
  const result = await generateJson(provider, recallQuestionsSchema, {
    task: "recall_questions",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 6000,
    temperature: 0.4,
  });
  return { questions: result.data.questions.slice(0, input.count), provider: result.raw.provider, model: result.raw.model };
}

export const recallComparisonSchema = z.object({
  score: z.number().min(0).max(100),
  correct_points: points,
  missing_points: points,
  incorrect_points: points,
  feedback: text(1500),
});

/** A checked recall answer as stored and shown; its verdict comes from the score by RevTaw's one rule (verdict.ts). */
export type RecallComparison = z.infer<typeof recallComparisonSchema> & { verdict: Verdict };

export async function compareRecallAnswer(input: {
  materialTitle: string;
  prompt: string;
  modelAnswer: string;
  keyPoints: string[];
  studentAnswer: string;
}): Promise<{ comparison: RecallComparison; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const system = `You are RevTaw's fair, encouraging recall checker for "${input.materialTitle}".
Compare the student's answer with the model answer and key points only — never reward facts outside them.
- "correct_points": key points the student covered (wording may differ).
- "missing_points": key points not covered.
- "incorrect_points": statements in the student's answer that contradict the model answer.
- "score": 0-100: the share of key points covered, minus clear errors; 0 for a blank or off-topic answer.
- "feedback": 1-3 sentences to the student: what was right, what to add, one tip. Plain words.
Respond with JSON only.`;
  const user = `Question: ${input.prompt}
Model answer: ${input.modelAnswer}
Key points:
${input.keyPoints.map((point) => `- ${point}`).join("\n") || "(use the model answer)"}
Student answer: ${input.studentAnswer.slice(0, 4000) || "(blank)"}`;
  const result = await generateJson(provider, recallComparisonSchema, {
    task: "recall_compare",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 1200,
    temperature: 0,
  });
  return { comparison: { ...result.data, verdict: verdictFor(result.data.score, PASS_SCORE.recall) }, provider: result.raw.provider, model: result.raw.model };
}

// ---------------------------------------------------------------------------
// Feynman technique
// ---------------------------------------------------------------------------

export const feynmanConceptsSchema = z.object({
  concepts: z
    .array(
      z.object({
        concept: text(120),
        ideal_explanation: text(2500),
        key_points: points,
        source_excerpt: z.string().trim().max(600).default(""),
      }),
    )
    .max(8),
});

export type FeynmanConcept = z.infer<typeof feynmanConceptsSchema>["concepts"][number];

export async function pickFeynmanConcepts(input: {
  materialTitle: string;
  chunks: AnalysisChunkInput[];
  count: number;
  focusConcepts: string[];
  student: StudentContext;
  /** The names the material's concepts already go by, to reuse. */
  knownConcepts?: string[];
}): Promise<{ concepts: FeynmanConcept[]; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const { transcript, coverageRatio, focused } = buildTranscript(input.chunks, undefined, input.focusConcepts.length ? { text: input.focusConcepts.join(", "), share: 0.5 } : null);
  const system = `You are RevTaw's Feynman-technique coach. Pick the concepts from a student's material that are worth explaining in plain words, and write the ideal beginner-level explanation for each.

Rules:
- Choose concepts that have real substance in the material (an idea, mechanism, process or relationship), not isolated facts.
- "ideal_explanation": 3-6 sentences a beginner could follow, grounded strictly in the material, using one concrete example from it when available. Clearly separate any analogy from the actual definition.
- "key_points": 3-6 points a good explanation must contain.
- "source_excerpt": a short verbatim quote (max 300 chars) that supports the explanation.
- "concept": the concept's name, 1-4 words; when the message lists the material's concept names, a concept on the list uses that name.
- Prefer the focus concepts when given. Use ONLY the material between <material> tags.
- Respond with a single JSON object matching the schema. No commentary.`;
  const user = `Material title: ${input.materialTitle}
Student: ${studentLine(input.student)}
${input.focusConcepts.length ? `Focus concepts (weak for this student): ${input.focusConcepts.join(", ")}\n` : ""}${knownConceptsLine(input.knownConcepts ?? [])}${coverageNote(coverageRatio, focused)}
${upTo(input.count, "concepts")}

JSON schema: { "concepts": [{ "concept": string, "ideal_explanation": string, "key_points": string[], "source_excerpt": string }] }

<material>
${transcript}
</material>`;
  const result = await generateJson(provider, feynmanConceptsSchema, {
    task: "feynman_concepts",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 5000,
    temperature: 0.4,
  });
  return { concepts: result.data.concepts.slice(0, input.count), provider: result.raw.provider, model: result.raw.model };
}

export const feynmanAnalysisSchema = z.object({
  score: z.number().min(0).max(100),
  correct_concepts: points,
  missing_concepts: points,
  incorrect_ideas: points,
  unnecessary_complexity: points,
  feedback: text(1500),
  improve_prompt: text(500),
});

export type FeynmanAnalysis = z.infer<typeof feynmanAnalysisSchema>;

export async function analyzeFeynmanExplanation(input: {
  materialTitle: string;
  concept: string;
  idealExplanation: string;
  keyPoints: string[];
  explanation: string;
  round: number;
}): Promise<{ analysis: FeynmanAnalysis; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const system = `You are RevTaw's Feynman-technique coach for "${input.materialTitle}". A student explained a concept as if teaching a beginner. Analyze the explanation against the ideal explanation and key points only.
- "correct_concepts": ideas the student got right.
- "missing_concepts": key points not covered.
- "incorrect_ideas": statements that are wrong according to the material.
- "unnecessary_complexity": jargon or detours a beginner would not need (empty if none).
- "score": 0-100 for completeness and accuracy in simple language.
- "feedback": 2-4 encouraging, specific sentences.
- "improve_prompt": one sentence telling the student what to add or fix in the next attempt (do not reveal the ideal explanation verbatim).
Respond with JSON only.`;
  const user = `Concept: ${input.concept}
Attempt: ${input.round}
Ideal explanation: ${input.idealExplanation}
Key points:
${input.keyPoints.map((point) => `- ${point}`).join("\n")}
Student explanation: ${input.explanation.slice(0, 6000) || "(blank)"}`;
  const result = await generateJson(provider, feynmanAnalysisSchema, {
    task: "feynman_analyze",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 1500,
    temperature: 0,
  });
  return { analysis: result.data, provider: result.raw.provider, model: result.raw.model };
}

// ---------------------------------------------------------------------------
// Blurting (Phase 8)
// ---------------------------------------------------------------------------

export const blurtComparisonSchema = z.object({
  remembered: points,
  missing: points,
  incorrect: points,
  forgotten_important: points,
  score: z.number().min(0).max(100),
  feedback: text(1500),
});

export type BlurtComparison = z.infer<typeof blurtComparisonSchema>;

export async function compareBlurt(input: { materialTitle: string; topic: string; source: string; keyPoints: string[]; studentText: string; attempt: number }): Promise<{ comparison: BlurtComparison; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const system = `You are RevTaw's blurting checker for "${input.materialTitle}". The student wrote everything they remembered about a section WITHOUT looking at it. Compare their text with the source section only.
- "remembered": ideas from the source the student stated correctly (short phrases).
- "missing": ideas in the source the student did not mention.
- "incorrect": statements that contradict the source.
- "forgotten_important": the subset of missing ideas that are definitions, key terms or the main point — the ones that matter most.
- "score": 0-100 share of the source's key ideas remembered, minus clear errors.
- "feedback": 1-3 encouraging, specific sentences${input.attempt === 1 ? " that tell the student what to add on their retry WITHOUT quoting the source" : ""}.
Respond with JSON only.`;
  const user = `Section: ${input.topic}
Key points:
${input.keyPoints.map((point) => `- ${point}`).join("\n") || "(derive from the source)"}
Source:
"""
${input.source.slice(0, 6000)}
"""
Student blurt (attempt ${input.attempt}):
"""
${input.studentText.slice(0, 6000) || "(blank)"}
"""`;
  const result = await generateJson(provider, blurtComparisonSchema, { task: "blurting_compare", system, messages: [{ role: "user", content: user }], maxTokens: 1500, temperature: 0 });
  return { comparison: result.data, provider: result.raw.provider, model: result.raw.model };
}

// ---------------------------------------------------------------------------
// Chunking (Phase 8)
// ---------------------------------------------------------------------------

export const chunkPlanSchema = z.object({
  chunks: z
    .array(
      z.object({
        title: modelTitle(),
        main_idea: text(600),
        details: z.array(z.string().trim().min(1).max(400)).max(8),
        mini_summary: text(600),
        recall_question: text(600),
        model_answer: text(1500),
        key_points: points,
        concept: text(120),
      }),
    )
    .max(12),
});

export type ChunkPlan = z.infer<typeof chunkPlanSchema>["chunks"][number];

export async function chunkMaterial(input: { materialTitle: string; chunks: AnalysisChunkInput[]; count: number; student: StudentContext }): Promise<{ chunks: ChunkPlan[]; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const { transcript } = buildTranscript(input.chunks);
  const system = `You are RevTaw's chunking coach. Break the material into manageable sections a student reads one at a time (spec: each chunk has a main idea, important details, a mini summary and one recall question).

Rules:
- Follow the material's own order and headings; each chunk covers one idea or sub-topic, never more than a few paragraphs.
- "main_idea": one sentence. "details": 2-6 important details in the material's words. "mini_summary": 1-2 sentences.
- "recall_question": one question answerable from this chunk alone (no yes/no); "model_answer" and 2-5 "key_points" grade the student's answer.
- "concept": the 1-4 word concept of the chunk.
- Use ONLY the material between <material> tags. Respond with a single JSON object matching the schema.`;
  const user = `Material title: ${input.materialTitle}
Student: ${studentLine(input.student)}
Produce about ${input.count} chunks.

JSON schema: { "chunks": [{ "title": string, "main_idea": string, "details": string[], "mini_summary": string, "recall_question": string, "model_answer": string, "key_points": string[], "concept": string }] }

<material>
${transcript}
</material>`;
  const result = await generateJson(provider, chunkPlanSchema, { task: "chunk_material", system, messages: [{ role: "user", content: user }], maxTokens: 7000, temperature: 0.3 });
  return { chunks: result.data.chunks.slice(0, Math.max(1, input.count)), provider: result.raw.provider, model: result.raw.model };
}

// ---------------------------------------------------------------------------
// Question generation (Phase 8)
// ---------------------------------------------------------------------------

export const questionEvaluationSchema = z.object({
  relevance: z.number().min(0).max(100),
  clarity: z.number().min(0).max(100),
  accuracy: z.number().min(0).max(100),
  difficulty: z.enum(["easy", "medium", "hard"]),
  overall: z.number().min(0).max(100),
  feedback: text(1500),
  improved_question: text(1000),
  model_answer: text(2000),
  concept: text(120),
});

export type QuestionEvaluation = z.infer<typeof questionEvaluationSchema>;

export async function evaluateStudentQuestion(input: { materialTitle: string; chunks: AnalysisChunkInput[]; question: string; expectedAnswer: string | null }): Promise<{ evaluation: QuestionEvaluation; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const { transcript } = buildTranscript(input.chunks, 60_000);
  const system = `You are RevTaw's question coach. A student wrote an exam-style question about their material (and optionally the answer they expect). Evaluate it against the material only.
- "relevance": 0-100 — does it test something the material covers and that matters?
- "clarity": 0-100 — unambiguous, one defensible answer, well worded?
- "accuracy": 0-100 — is the expected answer correct per the material (100 when no answer was given but the question is answerable)?
- "difficulty": easy | medium | hard.
- "overall": 0-100 weighted judgment.
- "feedback": 1-3 specific sentences on how to improve it.
- "improved_question": a better version (or the same if already good).
- "model_answer": the correct answer per the material.
- "concept": the 1-4 word concept tested.
Respond with JSON only.`;
  const user = `Material title: ${input.materialTitle}
Student's question: ${input.question.slice(0, 1000)}
Expected answer: ${input.expectedAnswer?.slice(0, 2000) || "(not given)"}

<material>
${transcript}
</material>`;
  const result = await generateJson(provider, questionEvaluationSchema, { task: "question_evaluate", system, messages: [{ role: "user", content: user }], maxTokens: 1500, temperature: 0 });
  return { evaluation: result.data, provider: result.raw.provider, model: result.raw.model };
}
