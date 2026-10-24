import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMBEDDING_DIMENSIONS, embedTexts, parseEmbeddings, toVectorLiteral } from "@/lib/ai/embeddings";
import { embedMissingChunks, keywordQuery, rankMaterialChunks } from "@/lib/search/hybrid";

const vector = (seed: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => (index === seed ? 1 : 0));

function stubEmbeddings() {
  const requests: Array<{ url: string; body: { model: string; input: string[] }; auth: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requests.push({ url, body, auth: (init.headers as Record<string, string>).authorization });
      return new Response(JSON.stringify({ data: body.input.map((_: string, index: number) => ({ index, embedding: vector(index) })) }), { status: 200 });
    }),
  );
  return requests;
}

beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "0123456789abcdef0123456789abcdef");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "cf-test-token");
  vi.stubEnv("CLOUDFLARE_AI_BASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("keywordQuery", () => {
  it("keeps content words from English, Filipino and Taglish questions", () => {
    expect(keywordQuery("Ano ang ginagawa ng chlorophyll sa halaman?")).toBe("ginagawa or chlorophyll or halaman");
    expect(keywordQuery("Where does the Calvin cycle take place?")).toBe("calvin or cycle or take or place");
    expect(keywordQuery("Explain mo nga yung light-dependent reactions")).toBe("explain or light or dependent or reactions");
    expect(keywordQuery("ano po ba yan?")).toBeNull();
  });

  it("caps the number of terms", () => {
    const query = keywordQuery(Array.from({ length: 30 }, (_, index) => `word${index}x`).join(" "));
    expect(query?.split(" or ")).toHaveLength(12);
  });
});

describe("embeddings", () => {
  it("posts texts to Workers AI's OpenAI-compatible embeddings endpoint", async () => {
    const requests = stubEmbeddings();
    const vectors = await embedTexts(["one", "two"]);
    expect(vectors).toHaveLength(2);
    expect(requests[0].url).toBe("https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/v1/embeddings");
    expect(requests[0].body).toEqual({ model: "@cf/baai/bge-m3", input: ["one", "two"] });
    expect(requests[0].auth).toBe("Bearer cf-test-token");
  });

  it("reads Cloudflare's native shape and rejects wrong sizes", () => {
    expect(parseEmbeddings({ result: { data: [vector(0)], shape: [1, 1024] } }, 1)).toHaveLength(1);
    const detail = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        return (error as { code?: string; detail?: string }).code + " " + (error as { detail?: string }).detail;
      }
      return "no error";
    };
    expect(detail(() => parseEmbeddings({ data: [{ embedding: [1, 2, 3] }] }, 1))).toMatch(/^invalid_output .*1024/);
    expect(detail(() => parseEmbeddings({ data: [] }, 1))).toMatch(/^invalid_output .*expected 1 vectors/);
  });

  it("writes vectors in pgvector's text format", () => {
    expect(toVectorLiteral([0.123456789, -1, 0])).toBe("[0.123457,-1,0]");
  });
});

describe("rankMaterialChunks", () => {
  it("embeds the question and asks Postgres for the fused ranking", async () => {
    stubEmbeddings();
    const rpc = vi.fn(async () => ({ data: [{ chunk_id: "c2", material_id: "m", chunk_position: 2, score: 0.04 }], error: null }));
    const ranked = await rankMaterialChunks({ rpc } as never, { materialId: "m", query: "Saan nangyayari ang Calvin cycle?", selection: null });
    expect(ranked).toEqual({ ids: ["c2"], semantic: true });
    expect(rpc).toHaveBeenCalledWith("match_material_chunks", expect.objectContaining({ keywords: "nangyayari or calvin or cycle", only_material: "m", match_count: 8 }));
    const args = (rpc.mock.calls[0] as unknown[])[1] as { query_embedding: string };
    expect(args.query_embedding.startsWith("[1,0,0")).toBe(true);
  });

  it("ranks by words when embeddings fail, and returns null when the function is missing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "missing" } });
    expect(await rankMaterialChunks({ rpc } as never, { materialId: "m", query: "calvin" })).toEqual({ ids: [], semantic: false });
    expect(await rankMaterialChunks({ rpc } as never, { materialId: "m", query: "calvin" })).toBeNull();
  });
});

describe("embedMissingChunks", () => {
  function fakeClient(pages: Array<Array<{ id: string; heading: string | null; content: string }>>) {
    const saved: unknown[] = [];
    const builder = {
      select: () => builder,
      is: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: async () => ({ data: pages.shift() ?? [], error: null }),
    };
    const client = {
      from: () => builder,
      rpc: vi.fn(async (_name: string, args: { items: unknown[] }) => {
        saved.push(...args.items);
        return { data: args.items.length, error: null };
      }),
    };
    return { client, saved };
  }

  it("embeds heading and text in batches until nothing is left", async () => {
    const requests = stubEmbeddings();
    const { client, saved } = fakeClient([
      [
        { id: "a", heading: "Calvin cycle", content: "Fixes carbon." },
        { id: "b", heading: null, content: "Light reactions." },
      ],
      [],
    ]);
    const outcome = await embedMissingChunks(client as never, { materialId: "m", budgetMs: 20_000 });
    expect(outcome).toEqual({ embedded: 2, remaining: false });
    expect(requests[0].body.input).toEqual(["Calvin cycle\nFixes carbon.", "Light reactions."]);
    expect(saved).toHaveLength(2);
    expect(client.rpc).toHaveBeenCalledWith("save_chunk_embeddings", expect.objectContaining({ model: "@cf/baai/bge-m3" }));
  });

  it("takes the backfill job's chunks in turns across students, with the daily cap", async () => {
    stubEmbeddings();
    const fair = [
      [
        { id: "a1", user_id: "u1", heading: null, content: "One." },
        { id: "b1", user_id: "u2", heading: null, content: "Two." },
      ],
      [],
    ];
    const calls: Array<[string, Record<string, unknown>]> = [];
    const client = {
      from: () => {
        throw new Error("the backfill job reads through unembedded_chunks_fair()");
      },
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        calls.push([name, args]);
        if (name === "unembedded_chunks_fair") return { data: fair.shift() ?? [], error: null };
        return { data: (args.items as unknown[]).length, error: null };
      }),
    };
    expect(await embedMissingChunks(client as never, { budgetMs: 20_000, maxChunks: 600 })).toEqual({ embedded: 2, remaining: false });
    expect(calls[0]).toEqual(["unembedded_chunks_fair", { batch_size: 20, daily_cap: 1000 }]);
    expect(calls[1][0]).toBe("save_chunk_embeddings");
  });

  it("does nothing without Cloudflare credentials", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
    const { client } = fakeClient([[{ id: "a", heading: null, content: "x" }]]);
    expect(await embedMissingChunks(client as never)).toEqual({ embedded: 0, remaining: false });
  });
});
