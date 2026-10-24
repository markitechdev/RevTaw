import "server-only";

import { createHash } from "node:crypto";

import { isAiError } from "@/lib/ai";
import { track } from "@/lib/analytics/server";
import { isStaleMaterial } from "@/lib/generation/stale";
import { analyzeMaterial, type AnalysisChunkInput } from "@/lib/materials/analyze";
import { chunkSections, countWords } from "@/lib/materials/chunk";
import { MAX_FILE_BYTES } from "@/lib/materials/constants";
import { detectMaterialType } from "@/lib/materials/detect";
import { ExtractionError, extractText, type ExtractionResult } from "@/lib/materials/extract";
import { downloadMaterialBytes } from "@/lib/materials/storage";
import { embedMaterialQuietly } from "@/lib/search/hybrid";
import type { Material, MaterialStatus } from "@/lib/supabase/database.types";
import { readPages } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";

/** More chunks than any material has (600 pages and 1.5 million characters at most are read); Supabase returns 1,000 rows a request. */
const MAX_CHUNKS_READ = 5000;

export const ANALYSIS_UNAVAILABLE_DETAIL =
  "Text extracted. AI analysis will run once an AI provider is configured for RevTaw.";

export type ProcessOutcome = {
  status: MaterialStatus;
  detail: string | null;
};

const IN_FLIGHT_GRACE_MS = 3 * 60_000;
const GENERIC_FAILURE = "Processing failed for an unexpected reason. Please try again.";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Runs the processing pipeline for one material owned by the signed-in user:
 *
 *   verify bytes → extract text → chunk → analyze with AI → ready
 *                                       ↘ embed chunks for Tamari's search
 *
 * The function is idempotent: it can be called again after a failure ("Retry")
 * and refuses to double-process a material that is already in flight.
 */
export async function processMaterial(
  materialId: string,
  options: { force?: boolean } = {},
): Promise<ProcessOutcome> {
  const supabase = await createClient();
  const { data: material, error } = await supabase
    .from("materials")
    .select("*")
    .eq("id", materialId)
    .maybeSingle();

  if (error) throw new Error(`materials: load failed: ${error.message}`);
  if (!material) throw new MaterialNotFoundError();
  // The file was deleted permanently: nothing left to process (and it must stay "deleted").
  if (material.status === "deleted") return { status: "deleted", detail: null };

  if (!options.force && isRecentlyInFlight(material)) {
    return { status: material.status, detail: material.status_detail };
  }
  if (!options.force && material.status === "ready") {
    return { status: "ready", detail: material.status_detail };
  }
  if (!material.storage_path) {
    return fail(supabase, material.id, "The uploaded file is missing. Please upload it again.");
  }

  await setStatus(supabase, material.id, "extracting", null, {
    processing_attempts: material.processing_attempts + 1,
    last_processed_at: new Date().toISOString(),
  });

  try {
    const bytes = await downloadMaterialBytes(supabase, material.storage_path);
    // Captured now: some parsers transfer the buffer to a worker, which leaves
    // `bytes` detached (byteLength 0) once extraction finishes.
    const byteLength = bytes.byteLength;
    if (byteLength === 0) {
      return fail(supabase, material.id, "The uploaded file is empty.");
    }
    if (byteLength > MAX_FILE_BYTES) {
      return fail(supabase, material.id, "The file is larger than the 25 MB limit.");
    }

    const detected = await detectMaterialType(bytes);
    if (!detected || detected.source !== material.source) {
      return fail(
        supabase,
        material.id,
        "The file content does not match its type. Please upload a PDF, Word document, image or text file.",
      );
    }

    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const reused = await reuseIdenticalMaterial(supabase, material, contentHash);
    if (reused) return reused;

    const extraction = await extractText(material.source, bytes, detected.mime);
    const chunks = chunkSections(extraction.sections);
    if (chunks.length === 0) {
      return fail(supabase, material.id, "No readable text was found in this material.");
    }

    await replaceChunks(supabase, material.id, material.user_id, chunks);

    const wordCount = countWords(extraction.sections.map((section) => section.text).join("\n"));
    await setStatus(supabase, material.id, "analyzing", null, {
      content_hash: contentHash,
      mime_type: detected.mime,
      file_size: byteLength,
      page_count: extraction.pageCount,
      word_count: wordCount,
    });

    // Embedding runs beside the analysis; if it fails, search uses words until the backfill job catches up.
    const [analysisDetail] = await Promise.all([runAnalysis(supabase, material, chunks), embedMaterialQuietly(supabase, material.id)]);
    const detail = [analysisDetail, extraction.truncated ? truncationNote(extraction) : null].filter(Boolean).join(" ") || null;
    await setStatus(supabase, material.id, "ready", detail);
    track(material.user_id, "material_processed", { source: material.source, status: "ready", method: extraction.method, chunks: chunks.length });
    return { status: "ready", detail };
  } catch (error) {
    const detail = friendlyFailure(error);
    console.error(`materials: processing ${material.id} failed`, error);
    track(material.user_id, "material_processed", { source: material.source, status: "failed" });
    return fail(supabase, material.id, detail);
  }
}

/**
 * Re-runs only the AI analysis for a material whose text is already
 * extracted (the "Re-analyze" button). Returns the student-facing detail.
 */
export async function reanalyzeMaterial(materialId: string): Promise<ProcessOutcome> {
  const supabase = await createClient();
  const { data: material, error } = await supabase
    .from("materials")
    .select("*")
    .eq("id", materialId)
    .maybeSingle();
  if (error) throw new Error(`materials: load failed: ${error.message}`);
  if (!material) throw new MaterialNotFoundError();

  if (material.status !== "ready" && material.status !== "failed" && !isStaleMaterial(material)) {
    return { status: material.status, detail: material.status_detail };
  }

  const chunkRows = await readPages(
    (from, to) => supabase.from("material_chunks").select("position, heading, page_start, page_end, content").eq("material_id", material.id).order("position").range(from, to),
    MAX_CHUNKS_READ,
  ).catch((error: unknown) => {
    // Without the stored text the file is processed again from the start.
    console.error("materials: reading the chunks to re-analyze failed", error instanceof Error ? error.message : error);
    return [];
  });
  if (chunkRows.length === 0) {
    return processMaterial(materialId, { force: true });
  }

  await setStatus(supabase, material.id, "analyzing", null, {
    last_processed_at: new Date().toISOString(),
  });
  const [detail] = await Promise.all([
    runAnalysis(
      supabase,
      material,
      chunkRows.map((row) => ({
        position: row.position,
        heading: row.heading,
        pageStart: row.page_start,
        pageEnd: row.page_end,
        content: row.content,
      })),
    ),
    // Materials processed before Tamari's search get their embeddings here too.
    embedMaterialQuietly(supabase, material.id),
  ]);
  await setStatus(supabase, material.id, "ready", detail);
  return { status: "ready", detail };
}

/**
 * Analysis step. Failures here never lose the extracted text: the material
 * still becomes "ready" and the detail explains that analysis is missing.
 */
async function runAnalysis(
  supabase: Client,
  material: Material,
  chunks: Array<{ position: number; heading: string | null; pageStart: number | null; pageEnd: number | null; content: string }>,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("education_level, main_goal")
    .eq("id", material.user_id)
    .maybeSingle();

  const input: AnalysisChunkInput[] = chunks.map((chunk) => ({
    position: chunk.position,
    heading: chunk.heading,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    content: chunk.content,
  }));

  try {
    const result = await analyzeMaterial(material.title, input, {
      educationLevel: profile?.education_level ?? null,
      mainGoal: profile?.main_goal ?? null,
    });
    const { summary, difficulty, estimated_study_minutes, ...data } = result.response;
    const { error } = await supabase.from("material_analyses").upsert({
      material_id: material.id,
      user_id: material.user_id,
      summary,
      difficulty,
      estimated_study_minutes,
      coverage_ratio: Number(result.coverageRatio.toFixed(3)),
      data,
      provider: result.provider,
      model: result.model,
    });
    if (error) throw new Error(`material_analyses: upsert failed: ${error.message}`);
    return result.coverageRatio < 1
      ? `Analyzed the first ${Math.round(result.coverageRatio * 100)}% of a very long material.`
      : null;
  } catch (error) {
    if (isAiError(error) && error.code === "not_configured") {
      return ANALYSIS_UNAVAILABLE_DETAIL;
    }
    console.error(`materials: analysis for ${material.id} failed`, error);
    const reason = isAiError(error) ? error.message : "Something went wrong while analyzing.";
    return `Text extracted, but the AI analysis did not complete: ${reason} Use Re-analyze to try again.`;
  }
}

export class MaterialNotFoundError extends Error {
  constructor() {
    super("Material not found");
    this.name = "MaterialNotFoundError";
  }
}

function isRecentlyInFlight(material: Material): boolean {
  if (material.status !== "extracting" && material.status !== "analyzing") return false;
  if (!material.last_processed_at) return false;
  return Date.now() - new Date(material.last_processed_at).getTime() < IN_FLIGHT_GRACE_MS;
}

/** Tells the student that a very long file was only read in part (EXTRACTION_LIMITS). */
function truncationNote(extraction: ExtractionResult): string {
  const lastPage = extraction.sections.at(-1)?.page;
  if (lastPage && extraction.pageCount) return `RevTaw read the first ${lastPage} of ${extraction.pageCount} pages; split the file to study the rest.`;
  return "RevTaw read the first part of this file; split it to study the rest.";
}

function friendlyFailure(error: unknown): string {
  if (error instanceof ExtractionError) return error.message;
  if (isAiError(error)) return error.message;
  return GENERIC_FAILURE;
}

async function setStatus(
  supabase: Client,
  materialId: string,
  status: MaterialStatus,
  detail: string | null,
  extra: Partial<Material> = {},
): Promise<void> {
  const { error } = await supabase
    .from("materials")
    .update({ status, status_detail: detail, ...extra })
    .eq("id", materialId);
  if (error) throw new Error(`materials: status update failed: ${error.message}`);
}

async function fail(supabase: Client, materialId: string, detail: string): Promise<ProcessOutcome> {
  await setStatus(supabase, materialId, "failed", detail);
  return { status: "failed", detail };
}

type ChunkToStore = ReturnType<typeof chunkSections>[number] & { embedding?: string | null; embeddingModel?: string | null };

async function replaceChunks(
  supabase: Client,
  materialId: string,
  userId: string,
  chunks: ChunkToStore[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("material_chunks")
    .delete()
    .eq("material_id", materialId);
  if (deleteError) throw new Error(`material_chunks: delete failed: ${deleteError.message}`);

  const embeddedAt = new Date().toISOString();
  const rows = chunks.map((chunk) => ({
    material_id: materialId,
    user_id: userId,
    position: chunk.position,
    heading: chunk.heading,
    page_start: chunk.pageStart,
    page_end: chunk.pageEnd,
    content: chunk.content,
    char_count: chunk.content.length,
    embedding: chunk.embedding ?? null,
    embedding_model: chunk.embedding ? (chunk.embeddingModel ?? null) : null,
    embedded_at: chunk.embedding ? embeddedAt : null,
  }));

  // Insert in batches to stay well under request size limits.
  for (let index = 0; index < rows.length; index += 50) {
    const { error } = await supabase.from("material_chunks").insert(rows.slice(index, index + 50));
    if (error) throw new Error(`material_chunks: insert failed: ${error.message}`);
  }
}

/**
 * Deduplication (spec §12/§45): when the student uploads a file whose bytes
 * are identical to a material that was already processed, copy its chunks and
 * analysis instead of extracting and analyzing again.
 */
async function reuseIdenticalMaterial(
  supabase: Client,
  material: Material,
  contentHash: string,
): Promise<ProcessOutcome | null> {
  const { data: twin } = await supabase
    .from("materials")
    .select("id, title, mime_type, file_size, page_count, word_count")
    .eq("content_hash", contentHash)
    .eq("status", "ready")
    .neq("id", material.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!twin) return null;

  // Every chunk of the twin, a page at a time (a long PDF has more than the 1,000 rows one read returns).
  const chunks = await readPages(
    (from, to) => supabase.from("material_chunks").select("position, heading, page_start, page_end, content, char_count, embedding, embedding_model").eq("material_id", twin.id).order("position").range(from, to),
    MAX_CHUNKS_READ,
  ).catch((error: unknown) => {
    // Without the twin's text the file is simply read again.
    console.error("materials: reading the identical material's chunks failed", error instanceof Error ? error.message : error);
    return [];
  });
  if (chunks.length === 0) return null;

  await replaceChunks(
    supabase,
    material.id,
    material.user_id,
    chunks.map((chunk) => ({
      position: chunk.position,
      heading: chunk.heading,
      pageStart: chunk.page_start,
      pageEnd: chunk.page_end,
      content: chunk.content,
      // The twin's embeddings are for the same text, so they are copied too.
      embedding: chunk.embedding,
      embeddingModel: chunk.embedding_model,
    })),
  );
  await embedMaterialQuietly(supabase, material.id, 15_000);

  const { data: analysis } = await supabase
    .from("material_analyses")
    .select("summary, difficulty, estimated_study_minutes, coverage_ratio, data, provider, model")
    .eq("material_id", twin.id)
    .maybeSingle();
  if (analysis) {
    await supabase.from("material_analyses").upsert({
      material_id: material.id,
      user_id: material.user_id,
      ...analysis,
    });
  }

  const detail = `Identical to "${twin.title}" — reused its extracted text${analysis ? " and analysis" : ""}.`;
  await setStatus(supabase, material.id, "ready", detail, {
    content_hash: contentHash,
    mime_type: twin.mime_type,
    file_size: twin.file_size,
    page_count: twin.page_count,
    word_count: twin.word_count,
  });
  return { status: "ready", detail };
}
