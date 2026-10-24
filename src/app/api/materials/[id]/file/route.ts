import { NextResponse } from "next/server";
import { z } from "zod";

import { STORAGE_BUCKET } from "@/lib/materials/constants";
import { safeFilename } from "@/lib/materials/storage";
import { localRateLimit } from "@/lib/rate-limit";
import { FILE_RESPONSE_CSP } from "@/lib/security/csp";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const paramsSchema = z.object({ id: z.uuid() });

/** MIME types the browser may render inline; everything else is downloaded. */
const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "text/plain", "text/markdown"]);

/** How long storage may take to start answering; the body itself streams for as long as the browser reads. */
const STORAGE_HEADERS_TIMEOUT_MS = 20_000;

/**
 * Serves the original file of one of the student's materials from the same
 * origin as the app, streamed straight from the private bucket: the function
 * never holds the whole file (Vercel rejects buffered responses over 4.5 MB),
 * the bucket stays private (no long-lived signed URLs), and the viewer embeds
 * PDFs and images without widening the Content Security Policy.
 */
export async function GET(_request: Request, context: RouteContext<"/api/materials/[id]/file">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  // Each hit streams a whole file out of the bucket; a viewer needs a handful a minute, not hundreds.
  const limit = localRateLimit(`material-file:${user.id}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many file requests. Try again in a minute." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  }

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid material id." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: material } = await supabase
    .from("materials")
    .select("storage_path, mime_type, original_filename, source")
    .eq("id", params.data.id)
    .maybeSingle();

  if (!material?.storage_path) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORAGE_HEADERS_TIMEOUT_MS);
  let body: ReadableStream<Uint8Array>;
  try {
    // Storage's RLS applies: the student's own session can only read their own folder.
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(material.storage_path, {}, { signal: controller.signal, cache: "no-store" })
      .asStream();
    if (error || !data) throw error ?? new Error("storage returned no body");
    body = data;
  } catch (error) {
    console.error("materials: file download failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "The file could not be loaded." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  const mime = material.mime_type ?? "application/octet-stream";
  const inline = INLINE_TYPES.has(mime);
  const filename = safeFilename(material.original_filename ?? "material").replace(/"/g, "");

  return new Response(body, {
    headers: {
      "content-type": mime.startsWith("text/") ? `${mime}; charset=utf-8` : mime,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      // Isolates whatever renders the file; src/proxy.ts leaves this route's policy in place.
      "content-security-policy": FILE_RESPONSE_CSP,
    },
  });
}
