/**
 * Reads a request body up to `maxBytes`, counting bytes as they arrive, and
 * stops reading (returning null) as soon as the body is larger. Unlike a
 * Content-Length check, it also holds for bodies sent without that header or
 * with a false one, and the server never buffers more than the limit.
 */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** A multipart or url-encoded form read with `readBodyWithLimit`: null when too large, "invalid" when unreadable. */
export async function readFormWithLimit(request: Request, maxBytes: number): Promise<FormData | null | "invalid"> {
  const body = await readBodyWithLimit(request, maxBytes);
  if (body === null) return null;
  try {
    return await new Response(body, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return "invalid";
  }
}
