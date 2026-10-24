import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { buildTranscript, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import { GROUNDING_RULE, points, studentLine, text } from "@/lib/study/prompts/shared";
import { modelTitle } from "@/lib/ai/fields";

/**
 * Prompts behind scenario-based and case-based learning (spec §16): realistic
 * applications of the material where the student chooses an action and
 * justifies it, or analyses a detailed case field by field.
 */

const FIELD_RULE =
  "Set each one in a realistic situation from the material's own field (a ward for nursing, a codebase for computer science, a company for business, a courtroom for law, a lab for science…), using the material's concepts — not trivia about the setting.";

// ---------------------------------------------------------------------------
// Scenarios: choose an action and justify it
// ---------------------------------------------------------------------------

export const scenarioSetSchema = z.object({
  scenarios: z
    .array(
      z
        .object({
          title: modelTitle(),
          situation: text(2500),
          question: text(400),
          options: z.array(text(400)).min(3).max(5),
          best_option: z.number().int().min(0),
          option_feedback: z.array(text(600)).min(1).max(5),
          rationale: text(1500),
          key_points: points,
          concept: text(120),
        })
        .transform((scenario) => ({
          ...scenario,
          best_option: Math.min(scenario.best_option, scenario.options.length - 1),
          option_feedback: scenario.options.map((_, index) => scenario.option_feedback[index] ?? (index === Math.min(scenario.best_option, scenario.options.length - 1) ? scenario.rationale : "This is not the best action here.")),
        })),
    )
    .min(1)
    .max(8),
});

export type GeneratedScenario = z.infer<typeof scenarioSetSchema>["scenarios"][number];

export async function generateScenarios(input: { materialTitle: string; chunks: AnalysisChunkInput[]; student: StudentContext; count: number; focusConcepts: string[] }): Promise<{ scenarios: GeneratedScenario[]; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const { transcript } = buildTranscript(input.chunks);
  const system = `You are RevTaw's scenario coach. You write realistic application scenarios a student must act on.

Rules:
- ${FIELD_RULE}
- "situation": 3-6 sentences with the details needed to decide. "question": what the student must decide ("What should … do first?").
- "options": 3-5 plausible actions; exactly one is best according to the material ("best_option" is its index). Wrong options should be tempting, not silly.
- "option_feedback": one sentence per option (same order) saying why it is or is not the best action.
- "rationale": why the best action is best, citing the material's ideas. "key_points": 2-4 ideas a good justification mentions.
- "concept": the 1-4 word concept applied.
- ${GROUNDING_RULE}
- Respond with a single JSON object matching the schema. No commentary.`;
  const user = `Material title: ${input.materialTitle}
Student: ${studentLine(input.student)}
${input.focusConcepts.length ? `Focus concepts (weak for this student): ${input.focusConcepts.join(", ")}\n` : ""}Produce exactly ${input.count} scenarios.

JSON schema: { "scenarios": [{ "title": string, "situation": string, "question": string, "options": string[], "best_option": number, "option_feedback": string[], "rationale": string, "key_points": string[], "concept": string }] }

<material>
${transcript}
</material>`;
  const result = await generateJson(provider, scenarioSetSchema, { task: "generate_scenarios", system, messages: [{ role: "user", content: user }], maxTokens: 7000, temperature: 0.4 });
  return { scenarios: result.data.scenarios.slice(0, Math.max(1, input.count)), provider: result.raw.provider, model: result.raw.model };
}

export const justificationEvaluationSchema = z.object({
  justification_score: z.number().min(0).max(100),
  strengths: points,
  gaps: points,
  feedback: text(1500),
});

export type JustificationEvaluation = z.infer<typeof justificationEvaluationSchema>;

export async function evaluateJustification(input: {
  materialTitle: string;
  situation: string;
  question: string;
  chosen: string;
  best: string;
  rationale: string;
  keyPoints: string[];
  justification: string;
}): Promise<{ evaluation: JustificationEvaluation; provider: string; model: string }> {
  const provider = getAiProvider("fast");
  const system = `You are RevTaw's reasoning checker for "${input.materialTitle}". The student chose an action in a scenario and justified it. Grade the JUSTIFICATION's reasoning against the material's rationale and key points (the choice itself is graded separately).
- "justification_score": 0-100 — does the reasoning use the right ideas from the material, correctly and specifically? A justification for a wrong choice can still earn credit for correct reasoning, but not for wrong claims.
- "strengths": what the reasoning got right. "gaps": missing or incorrect reasoning.
- "feedback": 1-3 encouraging, specific sentences.
Respond with JSON only.`;
  const user = `Situation: ${input.situation}
Question: ${input.question}
Student's choice: ${input.chosen}
Best action: ${input.best}
Rationale: ${input.rationale}
Key points:
${input.keyPoints.map((point) => `- ${point}`).join("\n") || "(use the rationale)"}
Student justification:
"""
${input.justification.slice(0, 4000) || "(blank)"}
"""`;
  const result = await generateJson(provider, justificationEvaluationSchema, { task: "scenario_evaluate", system, messages: [{ role: "user", content: user }], maxTokens: 1200, temperature: 0 });
  return { evaluation: result.data, provider: result.raw.provider, model: result.raw.model };
}

// ---------------------------------------------------------------------------
// Cases: problem, evidence, possible solutions, best solution, justification
// ---------------------------------------------------------------------------

export const CASE_FIELDS = ["problem", "evidence", "solutions", "best_solution", "justification"] as const;
export type CaseField = (typeof CASE_FIELDS)[number];

export const caseSetSchema = z.object({
  cases: z
    .array(
      z.object({
        title: modelTitle(),
        case_text: text(6000),
        task: text(400),
        model: z.object({
          problem: text(800),
          evidence: points,
          solutions: points,
          best_solution: text(800),
          justification: text(1500),
        }),
        concept: text(120),
      }),
    )
    .min(1)
    .max(4),
});

export type GeneratedCase = z.infer<typeof caseSetSchema>["cases"][number];
export type CaseModel = GeneratedCase["model"];

export async function generateCases(input: { materialTitle: string; chunks: AnalysisChunkInput[]; student: StudentContext; count: number; focusConcepts: string[] }): Promise<{ cases: GeneratedCase[]; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const { transcript } = buildTranscript(input.chunks);
  const system = `You are RevTaw's case-study author. You write detailed cases a student analyses.

Rules:
- ${FIELD_RULE}
- "case_text": 2-4 short paragraphs: background, the data or observations (evidence, some of it irrelevant), and a complication. Do not name the problem outright.
- "task": what the student must do (identify the problem, the evidence, possible solutions, the best one and justify it).
- "model": the expert analysis — "problem" (the core problem), "evidence" (the facts from the case that point to it), "solutions" (2-4 possible solutions), "best_solution", "justification" (why it is best, using the material's ideas).
- "concept": the 1-4 word concept the case exercises.
- ${GROUNDING_RULE}
- Respond with a single JSON object matching the schema. No commentary.`;
  const user = `Material title: ${input.materialTitle}
Student: ${studentLine(input.student)}
${input.focusConcepts.length ? `Focus concepts (weak for this student): ${input.focusConcepts.join(", ")}\n` : ""}Produce exactly ${input.count} cases.

JSON schema: { "cases": [{ "title": string, "case_text": string, "task": string, "model": { "problem": string, "evidence": string[], "solutions": string[], "best_solution": string, "justification": string }, "concept": string }] }

<material>
${transcript}
</material>`;
  const result = await generateJson(provider, caseSetSchema, { task: "generate_cases", system, messages: [{ role: "user", content: user }], maxTokens: 8000, temperature: 0.4 });
  return { cases: result.data.cases.slice(0, Math.max(1, input.count)), provider: result.raw.provider, model: result.raw.model };
}

const fieldScore = z.object({ score: z.number().min(0).max(100), feedback: text(800) });

export const caseEvaluationSchema = z.object({
  fields: z.object({ problem: fieldScore, evidence: fieldScore, solutions: fieldScore, best_solution: fieldScore, justification: fieldScore }),
  overall: z.number().min(0).max(100),
  strengths: points,
  gaps: points,
  feedback: text(1500),
});

export type CaseEvaluation = z.infer<typeof caseEvaluationSchema>;
export type CaseAnswer = Record<CaseField, string>;

export async function evaluateCaseAnalysis(input: { materialTitle: string; caseText: string; model: CaseModel; answer: CaseAnswer }): Promise<{ evaluation: CaseEvaluation; provider: string; model: string }> {
  const provider = getAiProvider("fast");
  const system = `You are RevTaw's case-analysis examiner for "${input.materialTitle}". Evaluate the student's REASONING field by field against the expert analysis; other well-argued answers supported by the case and the material also earn credit.
- "fields": a 0-100 score and one feedback sentence for problem, evidence, solutions, best_solution and justification.
- "overall": 0-100 weighted toward the problem, the best solution and the justification.
- "strengths" / "gaps": the reasoning done well / missed. "feedback": 1-3 specific sentences.
Respond with JSON only.`;
  const user = `Case:
"""
${input.caseText.slice(0, 6000)}
"""
Expert analysis:
Problem: ${input.model.problem}
Evidence: ${input.model.evidence.join("; ")}
Possible solutions: ${input.model.solutions.join("; ")}
Best solution: ${input.model.best_solution}
Justification: ${input.model.justification}
Student analysis:
Problem: ${input.answer.problem || "(blank)"}
Evidence: ${input.answer.evidence || "(blank)"}
Possible solutions: ${input.answer.solutions || "(blank)"}
Best solution: ${input.answer.best_solution || "(blank)"}
Justification: ${input.answer.justification || "(blank)"}`;
  const result = await generateJson(provider, caseEvaluationSchema, { task: "case_evaluate", system, messages: [{ role: "user", content: user }], maxTokens: 2000, temperature: 0 });
  return { evaluation: result.data, provider: result.raw.provider, model: result.raw.model };
}
