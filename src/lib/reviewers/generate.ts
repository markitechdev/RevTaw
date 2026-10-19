import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { buildTranscript, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import { EDUCATION_LEVEL_LABEL, STUDY_GOAL_LABEL } from "@/lib/profile/options";
import { REVIEWER_KIND_BY_ID } from "@/lib/reviewers/kinds";
import type { ReviewerKind } from "@/lib/supabase/database.types";

export const SECTION_CONTENT_MAX = 20_000;

const sectionSchema = z.object({
  heading: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(SECTION_CONTENT_MAX),
});

export const reviewerResponseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  sections: z.array(sectionSchema).min(1).max(24),
});

export type ReviewerResponse = z.infer<typeof reviewerResponseSchema>;
export type ReviewerSectionDraft = z.infer<typeof sectionSchema>;

const GROUNDING_RULES = `Rules:
- Use ONLY the material between <material> tags. Never add facts, definitions, formulas, dates or examples that are not in it. If the material lacks something, say so briefly instead of inventing it.
- Keep the material's language and terminology.
- Format section content as simple markdown: paragraphs, "-" bullet lists, "1." numbered lists, **bold**, _italic_ and \`code\` for formulas. No headings inside content (the section heading is separate), no tables, no HTML.
- Write for a student who will study from this alone: clear, specific, no filler.
- Respond with a single JSON object matching the schema. No commentary.`;

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

export type GenerateReviewerResult = {
  response: ReviewerResponse;
  provider: string;
  model: string;
  coverageRatio: number;
};

/** Generates a complete reviewer of the given kind from the material chunks. */
export async function generateReviewer(
  materialTitle: string,
  chunks: AnalysisChunkInput[],
  kind: ReviewerKind,
  student: StudentContext,
): Promise<GenerateReviewerResult> {
  const provider = getAiProvider("strong");
  const info = REVIEWER_KIND_BY_ID[kind];
  const { transcript, coverageRatio } = buildTranscript(chunks);

  const system = `You are RevTaw's reviewer writer. You turn a student's uploaded material into a "${info.name}" (${info.description}).

Format guidance: ${info.guidance}
${info.fixedSections ? `Section headings must be exactly: ${info.fixedSections.map((heading) => `"${heading}"`).join(", ")}.` : ""}

${GROUNDING_RULES}`;

  const user = `Material title: ${materialTitle}
Student: ${studentLine(student)}
${coverageRatio < 1 ? `Note: only the first ${Math.round(coverageRatio * 100)}% of the material is included; cover what you can see.\n` : ""}
JSON schema:
{
  "title": string (max 160 chars, e.g. "Arrays — Complete Reviewer"),
  "sections": [{ "heading": string (max 200), "content": string (markdown, max ${SECTION_CONTENT_MAX}) }] (1-24 items)
}

<material>
${transcript}
</material>`;

  const result = await generateJson(provider, reviewerResponseSchema, {
    task: "generate_reviewer",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 8000,
    temperature: 0.3,
  });

  return {
    response: result.data,
    provider: result.raw.provider,
    model: result.raw.model,
    coverageRatio,
  };
}

/**
 * Regenerates one section while keeping the rest of the reviewer intact.
 * Optional student instructions ("make it shorter", "add an example") steer it.
 */
export async function regenerateSection(
  materialTitle: string,
  chunks: AnalysisChunkInput[],
  kind: ReviewerKind,
  sections: ReviewerSectionDraft[],
  index: number,
  instructions: string | null,
  student: StudentContext,
): Promise<{ section: ReviewerSectionDraft; provider: string; model: string }> {
  const provider = getAiProvider("strong");
  const info = REVIEWER_KIND_BY_ID[kind];
  const { transcript } = buildTranscript(chunks);
  const target = sections[index];
  if (!target) throw new Error("section index out of range");

  const others = sections
    .map((section, position) => (position === index ? null : `- ${section.heading}`))
    .filter(Boolean)
    .join("\n");

  const system = `You are RevTaw's reviewer writer. The student is editing a "${info.name}" built from their material and wants ONE section rewritten.

Format guidance for this reviewer kind: ${info.guidance}

${GROUNDING_RULES}
- Rewrite only the requested section. Do not repeat content that belongs to the other sections listed.
- Keep the heading unless the student's instructions ask to change it.`;

  const user = `Material title: ${materialTitle}
Student: ${studentLine(student)}

Other sections in this reviewer (do not duplicate them):
${others || "(none)"}

Section to rewrite:
Heading: ${target.heading}
Current content:
${target.content.slice(0, 6000)}

${instructions ? `Student's instructions: ${instructions}` : "Student's instructions: produce a better version — clearer, more complete, still grounded in the material."}

JSON schema: { "heading": string (max 200), "content": string (markdown, max ${SECTION_CONTENT_MAX}) }

<material>
${transcript}
</material>`;

  const result = await generateJson(provider, sectionSchema, {
    task: "regenerate_section",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 4000,
    temperature: 0.4,
  });

  return { section: result.data, provider: result.raw.provider, model: result.raw.model };
}
