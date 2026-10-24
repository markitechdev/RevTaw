import { describe, expect, it } from "vitest";

import { readBodyWithLimit, readFormWithLimit } from "@/lib/server/read-body";

function streamed(chunks: number[], chunkSize: number): Request {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunks.length) return controller.close();
      controller.enqueue(new Uint8Array(chunkSize).fill(chunks[sent]));
      sent += 1;
    },
  });
  // No Content-Length: the size is only known by reading.
  return new Request("http://localhost/upload", { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("readBodyWithLimit", () => {
  it("returns the whole body when it fits", async () => {
    const body = await readBodyWithLimit(streamed([1, 2, 3], 100), 300);
    expect(body?.byteLength).toBe(300);
    expect(body?.[0]).toBe(1);
    expect(body?.[299]).toBe(3);
  });

  it("stops at the first chunk past the limit, whatever Content-Length says", async () => {
    expect(await readBodyWithLimit(streamed([1, 2, 3, 4], 100), 250)).toBeNull();
  });

  it("treats a missing body as empty", async () => {
    expect((await readBodyWithLimit(new Request("http://localhost/"), 10))?.byteLength).toBe(0);
  });
});

describe("readFormWithLimit", () => {
  it("parses a multipart form under the limit and refuses a larger one", async () => {
    const form = new FormData();
    form.set("audio", new Blob([new Uint8Array(500)], { type: "audio/webm" }), "clip.webm");
    form.set("language", "fil");
    const small = await readFormWithLimit(new Request("http://localhost/", { method: "POST", body: form }), 10_000);
    expect(small).toBeInstanceOf(FormData);
    expect(((small as FormData).get("audio") as Blob).size).toBe(500);
    expect((small as FormData).get("language")).toBe("fil");
    expect(await readFormWithLimit(new Request("http://localhost/", { method: "POST", body: form }), 300)).toBeNull();
  });

  it("reports a body that is not a form", async () => {
    const request = new Request("http://localhost/", { method: "POST", body: "plain text", headers: { "content-type": "multipart/form-data; boundary=nope" } });
    expect(await readFormWithLimit(request, 1000)).toBe("invalid");
  });
});
