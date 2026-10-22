import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { EMBEDDING_BATCH, EMBEDDING_MODEL, embeddingsConfigured, embedTexts, toVectorLiteral } from "@/lib/ai/embeddings";
import type { Database } from "@/lib/supabase/database.types";
import { tokenize } from "@/lib/tutor/context";

/**
 * Tamari's search (migration 0017): hybrid retrieval over a material's
 * chunks. The question is embedded with BGE-M3 and matched three ways in
 * Postgres — words ('simple' full-text, so Filipino and Taglish match as
 * written), trigram similarity for short queries, and embedding distance —
 * then fused with reciprocal rank fusion. When embeddings are unavailable it
 * still ranks by words; when the database function is missing, callers fall
 * back to RevTaw's in-app keyword scoring.
 */

type Client = SupabaseClient<Database>;

/** Common Filipino function words, so "Ano ang ginagawa ng chlorophyll?" searches for "ginagawa" and "chlorophyll". */
const FILIPINO_STOPWORDS = new Set(
  (
    "ang ng nang mga sa na at ay si ni kay sina nina kina ko mo niya namin natin ninyo nila ako ikaw siya kami tayo kayo sila " +
    "ito iyan iyon yan yun yung ung dito diyan doon ano sino saan kailan bakit paano ilan alin po opo naman lang lamang din rin " +
    "pa ba kasi kung para pag kapag nga hindi oo wala may mayroon meron isang isa pero kaya daw raw muna pala sana diba " +
    "ganito ganyan ganoon iba lahat bawat tungkol gaya tulad mula hanggang habang dahil upang nito niyan noon ngayon ating " +
    "aming kanilang kaniyang kanyang iyong aking ninyong sakin sayo samin satin ganun talaga parang mas pinaka"
  ).split(" "),
);

const MAX_TERMS = 12;

/**
 * The question's content words joined with "or", for websearch_to_tsquery:
 * any matching word counts, and chunks with more of them rank higher.
 */
export function keywordQuery(text: string): string | null {
  const terms: string[] = [];
  for (const token of tokenize(text)) {
    for (const part of token.split(/[^\p{L}\p{N}]+/u)) {
      if (part.length > 2 && !FILIPINO_STOPWORDS.has(part) && !terms.includes(part)) terms.push(part);
      if (terms.length >= MAX_TERMS) break;
    }
    if (terms.length >= MAX_TERMS) break;
  }
  return terms.length > 0 ? terms.join(" or ") : null;
}

export type RankedChunks = {
  /** Chunk ids, most relevant first. */
  ids: string[];
  /** Whether the question's embedding took part (false: words only). */
  semantic: boolean;
};

let warnedUnavailable = false;

/**
 * Ranks one material's chunks for a question. Returns null when the
 * database function is unavailable, so callers can fall back to keywords.
 */
export async function rankMaterialChunks(
  supabase: Client,
  input: { materialId: string; query: string; selection?: string | null; limit?: number },
): Promise<RankedChunks | null> {
  const text = [input.query, input.selection ?? ""].join("\n").trim();
  if (!text) return null;

  let embedding: string | null = null;
  if (embeddingsConfigured()) {
    try {
      const [vector] = await embedTexts([text.slice(0, 2_000)], { timeoutMs: 6_000 });
      embedding = toVectorLiteral(vector);
    } catch (error) {
      console.warn("search: question embedding failed; ranking by words only", error instanceof Error ? error.message : error);
    }
  }

  const { data, error } = await supabase.rpc("match_material_chunks", {
    query_text: text.slice(0, 500),
    keywords: keywordQuery(text),
    query_embedding: embedding,
    only_material: input.materialId,
    match_count: input.limit ?? 8,
  });
  if (error) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn(`search: hybrid search unavailable (${error.code ?? "error"}: ${error.message}); using keyword scoring. Run supabase/migrations/0017_hybrid_search.sql.`);
    }
    return null;
  }
  return { ids: (data ?? []).map((row) => row.chunk_id), semantic: embedding !== null };
}

export type EmbedOutcome = { embedded: number; remaining: boolean };

/**
 * Embeds chunks that have no embedding yet, in batches, until the time
 * budget runs out. With `materialId` it covers one material (right after
 * processing); without it, every chunk the client may update (the backfill
 * job runs it with the server's secret key).
 */
export async function embedMissingChunks(
  supabase: Client,
  options: { materialId?: string; budgetMs?: number; maxChunks?: number } = {},
): Promise<EmbedOutcome> {
  if (!embeddingsConfigured()) return { embedded: 0, remaining: false };
  const deadline = Date.now() + (options.budgetMs ?? 20_000);
  const maxChunks = options.maxChunks ?? 400;
  let embedded = 0;

  while (embedded < maxChunks && deadline - Date.now() > 3_000) {
    let query = supabase.from("material_chunks").select("id, heading, content").is("embedding", null);
    if (options.materialId) query = query.eq("material_id", options.materialId);
    const { data: rows, error } = await query.order("material_id").order("position").limit(Math.min(EMBEDDING_BATCH, maxChunks - embedded));
    if (error) throw new Error(`material_chunks: unembedded query failed: ${error.message}`);
    if (!rows || rows.length === 0) return { embedded, remaining: false };

    const vectors = await embedTexts(
      rows.map((row) => (row.heading ? `${row.heading}\n${row.content}` : row.content)),
      { timeoutMs: Math.max(5_000, deadline - Date.now()) },
    );
    const items = rows.map((row, index) => ({ id: row.id, embedding: toVectorLiteral(vectors[index]) }));
    const { data: saved, error: saveError } = await supabase.rpc("save_chunk_embeddings", { items, model: EMBEDDING_MODEL });
    if (saveError) throw new Error(`material_chunks: saving embeddings failed: ${saveError.message}`);
    embedded += saved ?? 0;
    // Nothing saved means these rows are not writable with this client; stop instead of looping.
    if (!saved) return { embedded, remaining: true };
  }
  return { embedded, remaining: true };
}

/** embedMissingChunks for one material that never throws: search falls back to words if it fails. */
export async function embedMaterialQuietly(supabase: Client, materialId: string, budgetMs = 25_000): Promise<EmbedOutcome | null> {
  try {
    return await embedMissingChunks(supabase, { materialId, budgetMs });
  } catch (error) {
    console.warn(`search: embedding material ${materialId} failed; the backfill job will retry`, error instanceof Error ? error.message : error);
    return null;
  }
}
