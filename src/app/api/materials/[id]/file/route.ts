import { NextResponse } from "next/server";
import { z } from "zod";

import { downloadMaterialBytes, safeFilename } from "@/lib/materials/storage";
import { rateLimit } from "@/lib/rate-limit";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const paramsSchema = z.object({ id: z.uuid() });

/** MIME types the browser may render inline; everything else is downloaded. */
const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "text/plain", "text/markdown"]);

/**
 * Serves the original file of one of the student's materials from the same
 * origin as the app. Streaming through this route keeps the bucket private
 * (no long-lived signed URLs) and lets the viewer embed PDFs and images
 * without widening the Content Security Policy.
 */
export async function GET(_request: Request, context: RouteContext<"/api/materials/[id]/file">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  // Each hit streams a whole file out of the bucket; a viewer needs a handful a minute, not hundreds.
  const limit = rateLimit(`material-file:${user.id}`, 60, 60_000);
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

  let bytes: Uint8Array;
  try {
    bytes = await downloadMaterialBytes(supabase, material.storage_path);
  } catch (error) {
    console.error("materials: file download failed", error);
    return NextResponse.json({ error: "The file could not be loaded." }, { status: 502 });
  }

  const mime = material.mime_type ?? "application/octet-stream";
  const inline = INLINE_TYPES.has(mime);
  const filename = safeFilename(material.original_filename ?? "material").replace(/"/g, "");

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": mime.startsWith("text/") ? `${mime}; charset=utf-8` : mime,
      "content-length": String(bytes.byteLength),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      // Isolate anything that renders in the browser (e.g. PDF viewer scripts).
      "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
