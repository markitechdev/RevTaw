import { NextResponse } from "next/server";
import { z } from "zod";

import { renderDocx } from "@/lib/export/docx";
import { renderHtml } from "@/lib/export/html";
import { fileSlug, type ExportDocument } from "@/lib/export/model";
import { renderPdf } from "@/lib/export/pdf";
import { buildDeckExport, buildMistakesExport, buildPlanExport, buildProgressExport, buildQuizExport, buildResultsExport, buildReviewerExport, EXPORT_KINDS } from "@/lib/export/sources";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Export (spec §34): `GET /api/export/<kind>?id=…&format=pdf|docx|html[&print=1]`.
 * The signed-in client builds the document, so RLS decides what can be
 * exported; rendering never touches the network. `html` is the printable
 * page (with `print=1` it opens the print dialog), the others download.
 */

export const maxDuration = 60;

const querySchema = z.object({
  id: z.uuid().optional(),
  format: z.enum(["pdf", "docx", "html"]).default("html"),
  print: z.enum(["1", "0"]).optional(),
  answers: z.enum(["1", "0"]).optional(),
  view: z.enum(["learned", "open"]).optional(),
});

const paramsSchema = z.object({ kind: z.enum(EXPORT_KINDS) });

async function build(kind: (typeof EXPORT_KINDS)[number], query: z.infer<typeof querySchema>): Promise<ExportDocument | null | "missing-id"> {
  switch (kind) {
    case "reviewer":
      return query.id ? buildReviewerExport(query.id) : "missing-id";
    case "quiz":
      return query.id ? buildQuizExport(query.id, { answers: query.answers === "1" }) : "missing-id";
    case "results":
      return query.id ? buildResultsExport(query.id) : "missing-id";
    case "deck":
      return query.id ? buildDeckExport(query.id) : "missing-id";
    case "plan":
      return query.id ? buildPlanExport(query.id) : "missing-id";
    case "mistakes":
      return buildMistakesExport({ resolved: query.view === "learned" });
    case "progress":
      return buildProgressExport();
  }
}

export async function GET(request: Request, context: RouteContext<"/api/export/[kind]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to export." }, { status: 401 });
  const limit = await rateLimit(`export:${user.id}`, 30, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many exports in a short time. Try again in a minute." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Unknown export." }, { status: 404 });
  const url = new URL(request.url);
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!query.success) return NextResponse.json({ error: "Check the export options." }, { status: 400 });

  const document = await build(params.data.kind, query.data);
  if (document === "missing-id") return NextResponse.json({ error: "An id is required for this export." }, { status: 400 });
  if (!document) return NextResponse.json({ error: "Nothing to export." }, { status: 404 });

  const base = `${fileSlug(document.title)}-${new Date().toISOString().slice(0, 10)}`;
  const common = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
  if (query.data.format === "pdf") {
    const bytes = await renderPdf(document);
    return new NextResponse(new Uint8Array(bytes), { headers: { ...common, "content-type": "application/pdf", "content-disposition": `attachment; filename="${base}.pdf"`, "content-length": String(bytes.byteLength) } });
  }
  if (query.data.format === "docx") {
    const bytes = await renderDocx(document);
    return new NextResponse(new Uint8Array(bytes), { headers: { ...common, "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="${base}.docx"`, "content-length": String(bytes.byteLength) } });
  }
  const downloads = { pdf: `${url.pathname}?${new URLSearchParams({ ...Object.fromEntries(url.searchParams), format: "pdf", print: "0" })}`, docx: `${url.pathname}?${new URLSearchParams({ ...Object.fromEntries(url.searchParams), format: "docx", print: "0" })}` };
  const html = renderHtml(document, { print: query.data.print === "1", downloads, nonce: request.headers.get("x-nonce") });
  return new NextResponse(html, { headers: { ...common, "content-type": "text/html; charset=utf-8" } });
}
