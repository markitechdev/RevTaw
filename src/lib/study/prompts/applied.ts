import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { buildTranscript, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import { GROUNDING_RULE, points, studentLine, text } from "@/lib/study/prompts/shared";

/**
 * Prompts behind scenario-based learning (spec §16): realistic applications
 * of the material where the student chooses an action and justifies it.
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
          title: text(160),
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
