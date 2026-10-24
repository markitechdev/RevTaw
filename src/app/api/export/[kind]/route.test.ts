import { beforeEach, describe, expect, it, vi } from "vitest";

const sources = vi.hoisted(() => ({ buildReviewerExport: vi.fn(), renderPdf: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ ok: true, retryAfterSeconds: 0 }) }));
vi.mock("@/lib/export/pdf", () => ({ renderPdf: sources.renderPdf }));
vi.mock("@/lib/export/docx", () => ({ renderDocx: vi.fn() }));
vi.mock("@/lib/export/sources", () => ({
  EXPORT_KINDS: ["reviewer", "quiz", "results", "deck", "plan", "mistakes", "progress"],
  buildReviewerExport: sources.buildReviewerExport,
  buildQuizExport: vi.fn(),
  buildResultsExport: vi.fn(),
  buildDeckExport: vi.fn(),
  buildPlanExport: vi.fn(),
  buildMistakesExport: vi.fn(),
  buildProgressExport: vi.fn(),
}));

const { GET } = await import("./route");

const ID = "7f3c2b1a-4d5e-4f60-8a9b-0c1d2e3f4a5b";
const exportOf = (format: string) => GET(new Request(`http://localhost/api/export/reviewer?id=${ID}&format=${format}`), { params: Promise.resolve({ kind: "reviewer" }) } as never);
const document = { title: "Cell biology", subtitle: null, meta: [], sections: [], footer: "Cell biology" };

describe("the export route", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sources.buildReviewerExport.mockReset();
    sources.renderPdf.mockReset();
  });

  it("answers a failed read in JSON", async () => {
    sources.buildReviewerExport.mockRejectedValue(new Error("connection reset"));
    const response = await exportOf("html");
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "The export could not be made. Please try again." });
  });

  it("answers a failed render in JSON too", async () => {
    sources.buildReviewerExport.mockResolvedValue(document);
    sources.renderPdf.mockRejectedValue(new Error("font missing"));
    const response = await exportOf("pdf");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "The export could not be made. Please try again." });
  });

  it("still sends the file when nothing fails", async () => {
    sources.buildReviewerExport.mockResolvedValue(document);
    sources.renderPdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    const response = await exportOf("pdf");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="Cell-biology-\d{4}-\d{2}-\d{2}\.pdf"$/);
  });
});
