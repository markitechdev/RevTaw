import "server-only";

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";

import { PARSER_MODULES } from "@/lib/materials/parser-modules";

/**
 * Runs the document parsers (pdf.js through pdf-parse, mammoth, word-extractor)
 * in a separate Node process with its own memory cap and a deadline.
 *
 * The 25 MB upload limit applies to the compressed file: a few hundred KB of
 * deflated XML or PDF streams can expand to gigabytes inside a parser. Here
 * such a file can only exhaust the child, which is killed, and never the
 * server process that also answers other students. The child starts with an
 * empty environment (no keys), reads the file from stdin and prints JSON.
 */

export type SandboxKind = "pdf" | "docx" | "doc";

export type SandboxLimits = {
  /** Wall-clock budget for the whole parse. */
  timeoutMs: number;
  /** Writable memory for the child (RLIMIT_DATA where the OS allows it; the V8 heap gets half). */
  memoryMb: number;
  /** PDF pages read at most. */
  maxPages: number;
  /** Characters of text (or HTML for Word) returned at most. */
  maxChars: number;
};

export const EXTRACTION_LIMITS: SandboxLimits = {
  timeoutMs: 50_000,
  memoryMb: 768,
  maxPages: 600,
  maxChars: 1_500_000,
};

export type SandboxOutput =
  | { kind: "pdf"; pages: Array<{ num: number; text: string }>; total: number; truncated: boolean }
  | { kind: "docx"; html: string; truncated: boolean }
  | { kind: "doc"; text: string; truncated: boolean };

export type SandboxFailure = "timeout" | "memory" | "crashed" | "output" | "parse";

export class SandboxError extends Error {
  constructor(
    readonly reason: SandboxFailure,
    readonly detail: string,
  ) {
    super(`extraction sandbox: ${reason}: ${detail}`);
    this.name = "SandboxError";
  }
}

/** JSON printed by the child is capped too; text is already limited to maxChars. */
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_STDERR_BYTES = 16 * 1024;

/**
 * The child program (an ES module). It only uses what the parent passes in
 * its environment and stdin, and answers `{ ok, result }` or `{ ok: false }`.
 */
const CHILD_SOURCE = String.raw`
const kind = process.env.REVTAW_KIND;
const maxPages = Number(process.env.REVTAW_MAX_PAGES);
const maxChars = Number(process.env.REVTAW_MAX_CHARS);
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = Buffer.concat(chunks);
const answer = (value) => new Promise((resolve) => process.stdout.write(JSON.stringify(value), resolve));
try {
  let result;
  if (kind === "pdf") {
    // Registers pdf.js's worker in this process (globalThis.pdfjsWorker), so pdf.js never has to locate the file.
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(input.buffer, input.byteOffset, input.byteLength) });
    try {
      const { total } = await parser.getInfo();
      const pages = [];
      let chars = 0;
      const last = Math.min(total, maxPages);
      for (let num = 1; num <= last && chars < maxChars; num += 1) {
        const page = (await parser.getText({ partial: [num] })).pages[0];
        const text = (page ? page.text : "").slice(0, maxChars - chars);
        chars += text.length;
        pages.push({ num, text });
      }
      result = { kind, pages, total, truncated: pages.length < total };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } else if (kind === "docx") {
    const mammoth = (await import("mammoth")).default;
    // Images are not needed for text: skip their base64 copies entirely.
    const options = { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) };
    const { value } = await mammoth.convertToHtml({ buffer: input }, options);
    result = { kind, html: value.slice(0, maxChars), truncated: value.length > maxChars };
  } else if (kind === "doc") {
    const WordExtractor = (await import("word-extractor")).default;
    const document = await new WordExtractor().extract(input);
    const body = document.getBody();
    result = { kind, text: body.slice(0, maxChars), truncated: body.length > maxChars };
  } else {
    throw new Error("unknown kind " + kind);
  }
  await answer({ ok: true, result });
} catch (error) {
  await answer({ ok: false, name: error && error.name ? String(error.name) : "Error", message: String(error && error.message ? error.message : error).slice(0, 500) });
}
process.exit(0);
`;

function childCommand(limits: SandboxLimits): { command: string; args: string[] } {
  const nodeArgs = [`--max-old-space-size=${Math.max(64, Math.floor(limits.memoryMb / 2))}`, "--input-type=module", "-e", CHILD_SOURCE];
  // Where a POSIX shell exists (Linux, Vercel, macOS), cap the child's writable memory: typed arrays
  // (decoded PDF streams) live outside the V8 heap and would ignore --max-old-space-size alone.
  if (process.platform !== "win32" && existsSync("/bin/sh")) {
    return {
      command: "/bin/sh",
      args: ["-c", `ulimit -d ${limits.memoryMb * 1024} 2>/dev/null; exec "$0" "$@"`, process.execPath, ...nodeArgs],
    };
  }
  return { command: process.execPath, args: nodeArgs };
}

/**
 * Loaded at run time: the bundler's file tracing cannot see what a spawned
 * command reads and would otherwise ship the whole project with the route.
 */
async function loadSpawn() {
  const childProcess = await import(/* turbopackIgnore: true */ "node:child_process");
  return childProcess.spawn;
}

/** Parses `bytes` in a child process; resolves with the parser's output or rejects with a SandboxError. */
export async function extractInSandbox(kind: SandboxKind, bytes: Uint8Array, limits: SandboxLimits = EXTRACTION_LIMITS): Promise<SandboxOutput> {
  // PARSER_MODULES lists what the child loads; it also keeps the packages in the deployment.
  if (!(kind in PARSER_MODULES)) throw new SandboxError("parse", `no parser for ${kind}`);
  const { command, args } = childCommand(limits);
  const spawn = await loadSpawn();
  return new Promise((resolve, reject) => {
    // The child keeps the server's working directory, where node_modules is (also on Vercel).
    const child: ChildProcessWithoutNullStreams = spawn(command, args, {
      // No secrets for a process that parses untrusted files: only what Node needs to start.
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: process.env.NODE_ENV ?? "production",
        REVTAW_KIND: kind,
        REVTAW_MAX_PAGES: String(limits.maxPages),
        REVTAW_MAX_CHARS: String(limits.maxChars),
        ...(process.platform === "win32" ? { SYSTEMROOT: process.env.SYSTEMROOT ?? "" } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let settled = false;
    let failure: SandboxError | null = null;

    const finish = (error: SandboxError | null, output?: SandboxOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(output!);
    };
    const stop = (error: SandboxError) => {
      failure ??= error;
      child.kill("SIGKILL");
    };

    const timer = setTimeout(() => stop(new SandboxError("timeout", `no answer after ${limits.timeoutMs} ms`)), limits.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        stop(new SandboxError("output", `more than ${MAX_OUTPUT_BYTES} bytes of output`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR_BYTES) stderr += chunk.toString("utf8").slice(0, MAX_STDERR_BYTES - stderr.length);
    });
    // The child may die before reading all of stdin (a crash, the memory cap): ignore the broken pipe.
    child.stdin.on("error", () => undefined);
    child.on("error", (error) => finish(new SandboxError("crashed", error.message)));
    child.on("close", (code, signal) => {
      if (failure) return finish(failure);
      if (code !== 0) {
        // Under the memory cap V8 or zlib may abort instead of throwing (bad_alloc, a failed mmap check).
        const memory = /out of memory|allocation failed|bad_alloc|Cannot allocate memory|ENOMEM|Check failed: \(result\.ptr\)/i.test(stderr);
        return finish(new SandboxError(memory ? "memory" : "crashed", `exit ${code ?? signal}: ${stderr.trim().split("\n").slice(-3).join(" | ").slice(0, 300)}`));
      }
      let envelope: { ok: true; result: SandboxOutput } | { ok: false; name: string; message: string };
      try {
        envelope = JSON.parse(Buffer.concat(stdout).toString("utf8"));
      } catch {
        return finish(new SandboxError("output", "the child's answer was not JSON"));
      }
      if (!envelope.ok) {
        // A parser that ran into the memory cap usually throws instead of crashing.
        const memory = /allocation failed|out of memory|Invalid string length|Invalid (typed )?array length/i.test(envelope.message);
        return finish(new SandboxError(memory ? "memory" : "parse", `${envelope.name}: ${envelope.message}`));
      }
      if (envelope.result.kind !== kind) return finish(new SandboxError("output", "the child answered for another kind"));
      finish(null, envelope.result);
    });

    child.stdin.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  });
}
