import "server-only";

import { isAiError } from "@/lib/ai";
import { isStaleGeneration } from "@/lib/generation/stale";
import type { AnalysisChunkInput } from "@/lib/materials/analyze";
import { generateReviewer, regenerateSection, type ReviewerSectionDraft } from "@/lib/reviewers/generate";
import { REVIEWER_KIND_BY_ID } from "@/lib/reviewers/kinds";
import type { ReviewerKind } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/** Loads the material's chunks in the shape the generators expect. */
export async function loadMaterialContext(supabase: Client, materialId: string) {
  const [{ data: material }, { data: chunks }, { data: profile }] = await Promise.all([
    supabase.from("materials").select("id, user_id, title, status, subject_id").eq("id", materialId).maybeSingle(),
    supabase
      .from("material_chunks")
      .select("id, position, heading, page_start, page_end, content")
      .eq("material_id", materialId)
      .order("position"),
    supabase.from("profiles").select("education_level, main_goal").maybeSingle(),
  ]);

  if (!material) throw new ServiceError("Material not found.", 404);
  if (material.status === "deleted") {
    throw new ServiceError(`The file behind “${material.title}” was deleted, so nothing new can be made from it. What you made from it before is still here.`, 410);
  }
  if (material.status !== "ready" || !chunks || chunks.length === 0) {
    throw new ServiceError("This material has not finished processing yet.", 409);
  }

  const chunkInput: AnalysisChunkInput[] = chunks.map((chunk) => ({
    position: chunk.position,
    heading: chunk.heading,
    pageStart: chunk.page_start,
    pageEnd: chunk.page_end,
    content: chunk.content,
  }));

  return {
    material,
    chunks: chunkInput,
    chunkIds: chunks.map((chunk) => chunk.id),
    student: {
      educationLevel: profile?.education_level ?? null,
      mainGoal: profile?.main_goal ?? null,
    },
  };
}

export function friendlyGenerationFailure(error: unknown): string {
  if (isAiError(error)) return error.message;
  if (error instanceof ServiceError) return error.message;
  return "Generation failed for an unexpected reason. Please try again.";
}

/**
 * Creates a reviewer row, generates its sections with the AI provider and
 * stores them. The row exists in "generating" state while the model works so
 * lists can show progress; failures keep the row with a student-facing detail.
 */
export async function createReviewer(materialId: string, kind: ReviewerKind): Promise<{ id: string; status: "ready" | "failed"; detail: string | null }> {
  const supabase = await createClient();
  const context = await loadMaterialContext(supabase, materialId);
  const info = REVIEWER_KIND_BY_ID[kind];

  const { data: reviewer, error } = await supabase
    .from("reviewers")
    .insert({
      user_id: context.material.user_id,
      material_id: materialId,
      kind,
      title: `${context.material.title} — ${info.name}`,
      status: "generating",
    })
    .select("id")
    .single();
  if (error || !reviewer) throw new Error(`reviewers: insert failed: ${error?.message}`);

  try {
    const result = await generateReviewer(context.material.title, context.chunks, kind, context.student);
    const rows = result.response.sections.map((section, position) => ({
      reviewer_id: reviewer.id,
      user_id: context.material.user_id,
      position,
      heading: section.heading,
      content: section.content,
    }));
    const { error: sectionsError } = await supabase.from("reviewer_sections").insert(rows);
    if (sectionsError) throw new Error(`reviewer_sections: insert failed: ${sectionsError.message}`);

    const detail = result.coverageRatio < 1 ? `Built from the first ${Math.round(result.coverageRatio * 100)}% of a very long material.` : null;
    const { error: readyError } = await supabase
      .from("reviewers")
      .update({
        title: result.response.title.slice(0, 160),
        status: "ready",
        status_detail: detail,
        provider: result.provider,
        model: result.model,
      })
      .eq("id", reviewer.id);
    if (readyError) throw new Error(`reviewers: ready update failed: ${readyError.message}`);
    return { id: reviewer.id, status: "ready", detail };
  } catch (generationError) {
    console.error(`reviewers: generation for ${reviewer.id} failed`, generationError);
    const detail = friendlyGenerationFailure(generationError);
    await supabase.from("reviewers").update({ status: "failed", status_detail: detail }).eq("id", reviewer.id);
    return { id: reviewer.id, status: "failed", detail };
  }
}

/** Retries generation for a failed reviewer in place. */
export async function retryReviewer(reviewerId: string): Promise<{ status: "ready" | "failed"; detail: string | null }> {
  const supabase = await createClient();
  const { data: reviewer } = await supabase.from("reviewers").select("id, user_id, material_id, kind, status, status_detail, updated_at").eq("id", reviewerId).maybeSingle();
  if (!reviewer) throw new ServiceError("Reviewer not found.", 404);
  // A generation cut off by a timeout or a closed tab stays "generating"; past the limit it may be retried.
  if (reviewer.status === "generating" && !isStaleGeneration(reviewer)) return { status: "failed", detail: "Still generating." };

  const context = await loadMaterialContext(supabase, reviewer.material_id);
  await supabase.from("reviewers").update({ status: "generating", status_detail: null }).eq("id", reviewer.id);

  try {
    const result = await generateReviewer(context.material.title, context.chunks, reviewer.kind, context.student);
    await supabase.from("reviewer_sections").delete().eq("reviewer_id", reviewer.id);
    const { error: sectionsError } = await supabase.from("reviewer_sections").insert(
      result.response.sections.map((section, position) => ({
        reviewer_id: reviewer.id,
        user_id: reviewer.user_id,
        position,
        heading: section.heading,
        content: section.content,
      })),
    );
    if (sectionsError) throw new Error(`reviewer_sections: insert failed: ${sectionsError.message}`);
    const { error: readyError } = await supabase
      .from("reviewers")
      .update({ title: result.response.title.slice(0, 160), status: "ready", status_detail: null, provider: result.provider, model: result.model })
      .eq("id", reviewer.id);
    if (readyError) throw new Error(`reviewers: ready update failed: ${readyError.message}`);
    return { status: "ready", detail: null };
  } catch (generationError) {
    console.error(`reviewers: retry for ${reviewer.id} failed`, generationError);
    const detail = friendlyGenerationFailure(generationError);
    await supabase.from("reviewers").update({ status: "failed", status_detail: detail }).eq("id", reviewer.id);
    return { status: "failed", detail };
  }
}

/** Regenerates a single section and stores the new version. */
export async function regenerateReviewerSection(
  reviewerId: string,
  sectionId: string,
  instructions: string | null,
): Promise<ReviewerSectionDraft> {
  const supabase = await createClient();
  const [{ data: reviewer }, { data: sections }] = await Promise.all([
    supabase.from("reviewers").select("id, material_id, kind").eq("id", reviewerId).maybeSingle(),
    supabase.from("reviewer_sections").select("id, position, heading, content").eq("reviewer_id", reviewerId).order("position"),
  ]);
  if (!reviewer || !sections) throw new ServiceError("Reviewer not found.", 404);
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index === -1) throw new ServiceError("Section not found.", 404);

  const context = await loadMaterialContext(supabase, reviewer.material_id);
  const result = await regenerateSection(
    context.material.title,
    context.chunks,
    reviewer.kind,
    sections.map((section) => ({ heading: section.heading, content: section.content })),
    index,
    instructions,
    context.student,
  );

  const { error } = await supabase
    .from("reviewer_sections")
    .update({ heading: result.section.heading, content: result.section.content, regenerated_at: new Date().toISOString() })
    .eq("id", sectionId);
  if (error) throw new Error(`reviewer_sections: update failed: ${error.message}`);

  return result.section;
}
