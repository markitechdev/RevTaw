import "server-only";

import { AiError } from "@/lib/ai/errors";
import { fetchWithTimeout, statusToAiError } from "@/lib/ai/providers/http";
import { getServerEnv } from "@/lib/env";

/**
 * Text embeddings for Tamari's search: BGE-M3 through Cloudflare Workers AI
 * (multilingual, 1024 dimensions, 8,192-token input, MIT-licensed weights,
 * so self-hosting the same model later needs no re-embedding). The column
 * in material_chunks is halfvec(1024), so the model is fixed here rather
 * than configurable.
 */
export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const EMBEDDING_DIMENSIONS = 1024;

/** Texts per request and characters per text (a chunk is at most ~4,800 characters). */
export const EMBEDDING_BATCH = 20;
const MAX_TEXT_CHARS = 8_000;

type OpenAiEmbeddingsResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
  // Cloudflare's native shape, in case a gateway returns it.
  result?: { data?: number[][]; shape?: number[] };
};

function embeddingsUrl(): string | null {
  const env = getServerEnv();
  if (env.CLOUDFLARE_AI_BASE_URL) return `${env.CLOUDFLARE_AI_BASE_URL.replace(/\/+$/, "")}/embeddings`;
  if (!env.CLOUDFLARE_ACCOUNT_ID) return null;
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/v1/embeddings`;
}

export function embeddingsConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.CLOUDFLARE_API_TOKEN && embeddingsUrl());
}

/** Reads either the OpenAI or the Cloudflare response shape, checking every vector's length. */
export function parseEmbeddings(data: OpenAiEmbeddingsResponse | null, expected: number): number[][] {
  let vectors: number[][] | undefined;
  if (Array.isArray(data?.data)) {
    vectors = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((item) => item.embedding ?? []);
  } else if (Array.isArray(data?.result?.data)) {
    vectors = data.result.data;
  }
  if (!vectors || vectors.length !== expected) {
    throw new AiError("invalid_output", `embeddings: expected ${expected} vectors, got ${vectors?.length ?? 0}`);
  }
  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || vector.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      throw new AiError("invalid_output", `embeddings: a vector is not ${EMBEDDING_DIMENSIONS} finite numbers`);
    }
  }
  return vectors;
}

/**
 * Embeds up to EMBEDDING_BATCH texts in one request. Throws AiError
 * ("not_configured" without Cloudflare credentials).
 */
export async function embedTexts(texts: string[], options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length > EMBEDDING_BATCH) {
    throw new AiError("content_too_large", `embeddings: ${texts.length} texts in one batch (max ${EMBEDDING_BATCH})`, false);
  }
  const url = embeddingsUrl();
  const token = getServerEnv().CLOUDFLARE_API_TOKEN;
  if (!url || !token) throw new AiError("not_configured", "embeddings need CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN", false);

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts.map((text) => text.slice(0, MAX_TEXT_CHARS) || " ") }),
    },
    options.signal,
    options.timeoutMs ?? 30_000,
  );
  if (!response.ok) throw await statusToAiError("cloudflare embeddings", response);
  const data = (await response.json().catch(() => null)) as OpenAiEmbeddingsResponse | null;
  return parseEmbeddings(data, texts.length);
}

/** pgvector's text format, which PostgREST passes through to halfvec columns and parameters. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => (Number.isFinite(value) ? Number(value.toPrecision(6)) : 0)).join(",")}]`;
}
