import "server-only";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { analysisResponseSchema, type AnalysisResponse } from "@/lib/materials/analysis-schema";
import { EDUCATION_LEVEL_LABEL, STUDY_GOAL_LABEL } from "@/lib/profile/options";
import { CORE_STUDY_METHODS } from "@/lib/study/methods";
import type { AiPreferences } from "@/lib/preferences/schema";
import type { EducationLevel, StudyGoal } from "@/lib/supabase/database.types";

/** Characters of material text sent to the model in one analysis (~35k tokens). */
export const ANALYSIS_CHAR_BUDGET = 140_000;

export type AnalysisChunkInput = {
  position: number;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  content: string;
};

export type StudentContext = {
  educationLevel: EducationLevel | null;
  mainGoal: StudyGoal | null;
  /** Settings → AI (language, tone, depth); used by conversational answers. */
  response?: AiPreferences;
};

export type AnalysisResult = {
  response: AnalysisResponse;
  coverageRatio: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

const SYSTEM_PROMPT = `You are RevTaw's study analyst. A student uploaded study material and you must describe what is in it so RevTaw can build reviewers, quizzes and study sessions.

Rules:
- Use ONLY the material between <material> tags. Never add facts, definitions, formulas or page numbers that are not in it. If something is absent, return an empty list for it.
- Quote terms and formulas exactly as written; keep the material's language.
- Be specific and useful to a student, not generic.
- Categorize each key concept by what mastering it mostly needs: "memorization", "understanding", "calculation" or "application".
- Estimate difficulty for the described student and the realistic minutes needed to study the whole material well (not just read it).
- Recommend 2 to 4 study methods from the allowed list that fit the content type (e.g. definition-heavy → flashcards, active_recall, spaced_repetition; concept-heavy → feynman, socratic_questioning, self_explanation; mathematics → worked_examples, faded_worked_examples, practice_problems, error_review; broad exam coverage → interleaving, practice_testing, spaced_repetition). Explain each choice in one sentence.
- Respond with a single JSON object matching the schema. No markdown, no commentary.`;

function schemaDescription(): string {
  const methods = CORE_STUDY_METHODS.map((method) => method.id).join(" | ");
  return `JSON schema (all keys required; use [] when nothing applies):
{
  "summary": string (2-4 sentences, max 1200 chars),
  "main_topics": [{ "title": string, "description": string | null }] (max 12, in material order),
  "key_concepts": [{ "name": string, "explanation": string, "category": "memorization" | "understanding" | "calculation" | "application" }] (max 20),
  "definitions": [{ "term": string, "definition": string }] (max 25, only definitions stated in the material),
  "formulas": [{ "name": string | null, "expression": string, "meaning": string | null }] (max 20, exactly as written),
  "important_facts": [string] (max 15: dates, numbers, processes, relationships, examples worth remembering),
  "exam_topics": [{ "topic": string, "why": string | null }] (max 10, what an examiner would most likely ask),
  "recommended_methods": [{ "method": ${methods}, "reason": string }] (2-4 items),
  "difficulty": "beginner" | "intermediate" | "advanced",
  "estimated_study_minutes": integer,
  "subject_guess": string | null (e.g. "Data Structures"),
  "language": string | null (e.g. "en", "fil")
}`;
}

/**
 * Builds the material transcript within the character budget. Chunks are
 * included in order with their headings and page ranges; when the material
 * is too long, the remaining headings are listed so the model knows what it
 * did not see, and the coverage ratio is reported to the student.
 */
export function buildTranscript(chunks: AnalysisChunkInput[], budget = ANALYSIS_CHAR_BUDGET) {
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
  const parts: string[] = [];
  let used = 0;
  let included = 0;

  for (const chunk of chunks) {
    const remaining = budget - used;
    if (remaining <= 0) break;
    const partial = chunk.content.length > remaining;
    // Don't bother with a tiny tail of the next section.
    if (partial && included > 0 && remaining < 500) break;
    const label = [
      chunk.heading ? `Section: ${chunk.heading}` : `Section ${chunk.position + 1}`,
      chunk.pageStart !== null
        ? chunk.pageEnd !== null && chunk.pageEnd !== chunk.pageStart
          ? `pages ${chunk.pageStart}-${chunk.pageEnd}`
          : `page ${chunk.pageStart}`
        : null,
    ]
      .filter(Boolean)
      .join(", ");
    const content = partial ? chunk.content.slice(0, remaining) : chunk.content;
    parts.push(`[${label}]\n${content}`);
    used += content.length;
    included += 1;
    if (partial) break;
  }

  const omitted = chunks.slice(included);
  if (omitted.length > 0) {
    const headings = omitted.map((chunk) => chunk.heading).filter((heading): heading is string => Boolean(heading));
    parts.push(
      `[Not included: ${omitted.length} more section(s)${headings.length ? ` titled: ${headings.slice(0, 20).join("; ")}` : ""}]`,
    );
  }

  return {
    transcript: parts.join("\n\n"),
    coverageRatio: totalChars === 0 ? 1 : Math.min(1, used / totalChars),
  };
}

export async function analyzeMaterial(
  title: string,
  chunks: AnalysisChunkInput[],
  student: StudentContext,
): Promise<AnalysisResult> {
  const provider = getAiProvider("strong");
  const { transcript, coverageRatio } = buildTranscript(chunks);

  const studentLine = [
    student.educationLevel ? `education level: ${EDUCATION_LEVEL_LABEL[student.educationLevel]}` : null,
    student.mainGoal ? `main goal: ${STUDY_GOAL_LABEL[student.mainGoal]}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const userPrompt = `Material title: ${title}
Student: ${studentLine || "not specified"}
${coverageRatio < 1 ? `Note: only the first ${Math.round(coverageRatio * 100)}% of the material is included below; base the analysis on what you can see.\n` : ""}
${schemaDescription()}

<material>
${transcript}
</material>`;

  const result = await generateJson(provider, analysisResponseSchema, {
    task: "analyze_material",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 6000,
    temperature: 0.2,
  });

  return {
    response: result.data,
    coverageRatio,
    provider: result.raw.provider,
    model: result.raw.model,
    inputTokens: result.raw.usage.inputTokens,
    outputTokens: result.raw.usage.outputTokens,
  };
}
