import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { buildTranscript, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import { PROBLEM_DIFFICULTIES, type ProblemDifficulty } from "@/lib/study/problem-options";
import { GROUNDING_RULE, MISTAKE_TYPES, points, studentLine, text } from "@/lib/study/prompts/shared";

/**
 * Prompts behind worked examples, faded worked examples and practice
 * problems (spec §16). Problems come from the formulas, procedures and facts
 * in the material; the evaluator grades the reasoning, not only the result.
 */

export { PROBLEM_DIFFICULTIES, type ProblemDifficulty } from "@/lib/study/problem-options";

const stepSchema = z.object({ step: text(600), explanation: text(800) });

export const solutionSchema = z.object({
  steps: z.array(stepSchema).min(1).max(10),
  final_answer: text(800),
  alternative_approach: z.string().trim().max(1200).nullable().optional().transform((value) => value || null),
});

export type Solution = z.infer<typeof solutionSchema>;
export type SolutionStep = z.infer<typeof stepSchema>;

export const problemSetSchema = z.object({
  problems: z
    .array(
      z.object({
        concept: text(120),
        difficulty: z.enum(PROBLEM_DIFFICULTIES).catch("medium"),
        problem: text(2000),
        solution: solutionSchema,
        key_points: points,
        // Worked examples: the similar problem the student solves on their own afterwards.
        practice: z
          .object({ problem: text(2000), solution: solutionSchema, key_points: points })
          .nullable()
          .optional()
          .transform((value) => value ?? null),
      }),
    )
    .min(1)
    .max(10),
});

export type GeneratedProblem = z.infer<typeof problemSetSchema>["problems"][number];

export type ProblemMode = "worked" | "faded" | "practice";

const MODE_RULES: Record<ProblemMode, string> = {
  worked:
    'Each problem is a WORKED EXAMPLE: "solution.steps" shows every step, and each step\'s "explanation" says why that step is done (the rule, formula or idea from the material). Also write "practice": a similar problem the student solves alone next (same method, different values or situation) with its own full solution.',
  faded:
    'Write ONE family of problems that all use the same method with the same step structure (3-6 steps each), getting slightly harder. The student will be given fewer of the steps each time, so every step must be a clear, self-contained move. "practice" is null.',
  practice:
    'Write independent practice problems. Give "alternative_approach" only when a genuinely different valid method exists (otherwise null). "practice" is null.',
};

export async function generateProblems(input: {
  materialTitle: string;
  chunks: AnalysisChunkInput[];
  student: StudentContext;
  mode: ProblemMode;
  count: number;
  /** Fixed difficulty, or per-concept adaptive targets. */
  difficulty: ProblemDifficulty | "adaptive";
  targets?: Array<{ concept: string; difficulty: string }>;
  /** Difficulty for concepts without a target, from the student's overall ability. */
  fallback?: string;
  focusConcepts?: string[];
}): Promise<{ problems: GeneratedProblem[]; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const { transcript } = buildTranscript(input.chunks);
  const difficultyRule =
    input.difficulty === "adaptive"
      ? input.targets?.length
        ? `Difficulty per concept (adaptive targets; advanced = challenge): ${input.targets.map((target) => `${target.concept}: ${target.difficulty}`).join("; ")}; other concepts: ${input.fallback ?? "medium"}.`
        : "Difficulty: start easy and rise to hard across the set."
      : `Every problem is "${input.difficulty}" difficulty (challenge = multi-step, combines ideas, no hints).`;
  const system = `You are RevTaw's problem-solving coach. You write source-grounded problems with complete step-by-step solutions.

Rules:
- ${MODE_RULES[input.mode]}
- Base problems on the formulas, procedures, rules, definitions and facts in the material. If the material has no calculations, write application problems (apply a procedure, classify a case, analyze a situation step by step) instead.
- Numbers you introduce must be plausible and the solution must follow from the material's rules; "final_answer" is short and checkable.
- "key_points": 2-5 points a correct solution must contain (method, key step, result).
- "concept": the 1-4 word concept practiced (reuse the material's wording).
- ${difficultyRule}
- ${GROUNDING_RULE}
- Respond with a single JSON object matching the schema. No commentary.`;
  const user = `Material title: ${input.materialTitle}
Student: ${studentLine(input.student)}
Mode: ${input.mode}
${input.focusConcepts?.length ? `Focus concepts (weak for this student): ${input.focusConcepts.join(", ")}\n` : ""}Produce exactly ${input.count} problems.

JSON schema: { "problems": [{ "concept": string, "difficulty": "easy" | "medium" | "hard" | "challenge", "problem": string, "solution": { "steps": [{ "step": string, "explanation": string }], "final_answer": string, "alternative_approach": string | null }, "key_points": string[], "practice": null | { "problem": string, "solution": { ... }, "key_points": string[] } }] }

<material>
${transcript}
</material>`;
  const result = await generateJson(provider, problemSetSchema, {
    task: "generate_problems",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 8000,
    temperature: 0.3,
  });
  return { problems: result.data.problems.slice(0, Math.max(1, input.count)), provider: result.raw.provider, model: result.raw.model };
}

export const problemEvaluationSchema = z.object({
  score: z.number().min(0).max(100),
  final_answer_correct: z.boolean().catch(false),
  correct_steps: points,
  errors: z
    .array(z.object({ step: text(300), issue: text(600) }))
    .max(8)
    .default([]),
  error_type: z.enum(MISTAKE_TYPES).catch("unclassified"),
  feedback: text(1500),
});

export type ProblemEvaluation = z.infer<typeof problemEvaluationSchema>;

export function formatSolution(solution: Solution): string {
  return [...solution.steps.map((step, index) => `Step ${index + 1}: ${step.step} — ${step.explanation}`), `Final answer: ${solution.final_answer}`].join("\n");
}

/** Grades a student's working against the reference solution: reasoning first, final answer second. */
export async function evaluateProblemAnswer(input: {
  materialTitle: string;
  problem: string;
  solution: Solution;
  keyPoints: string[];
  /** Faded examples: the steps the student was given. */
  givenSteps: SolutionStep[];
  work: string;
}): Promise<{ evaluation: ProblemEvaluation; provider: string; model: string }> {
  const provider = getAiProvider("fast");
  const system = `You are RevTaw's fair problem-solving checker for "${input.materialTitle}". Evaluate the student's REASONING, not just the final answer.
- Compare each step of the student's working with the reference solution; equivalent valid methods count as correct.
- "correct_steps": steps (or ideas) the student got right. "errors": where the reasoning went wrong — the step and the issue.
- "final_answer_correct": whether the student's final answer matches the reference (allow equivalent forms and rounding).
- "score": 0-100 (method and steps about 70%, final answer about 30%); 0 for blank work.
- "error_type": the main kind of mistake (misunderstood_concept, forgotten_information, calculation_error, misread_question, confused_concepts, unclassified).
- "feedback": 1-3 encouraging, specific sentences.
Respond with JSON only.`;
  const user = `Problem: ${input.problem}
${input.givenSteps.length ? `Steps already given to the student (do not grade these):\n${input.givenSteps.map((step, index) => `${index + 1}. ${step.step}`).join("\n")}\n` : ""}Reference solution:
${formatSolution(input.solution)}
Key points:
${input.keyPoints.map((point) => `- ${point}`).join("\n") || "(use the reference solution)"}
Student work:
"""
${input.work.slice(0, 6000) || "(blank)"}
"""`;
  const result = await generateJson(provider, problemEvaluationSchema, { task: "problem_evaluate", system, messages: [{ role: "user", content: user }], maxTokens: 1500, temperature: 0 });
  return { evaluation: result.data, provider: result.raw.provider, model: result.raw.model };
}
