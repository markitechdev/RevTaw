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

/**
 * Superscript and subscript text is wrapped in these private-use marks (Word math, raised or lowered PDF text,
 * so "10" + raised "23" doesn't read "1023"); extract.ts writes it out as "10²³" or "x^(n+1)".
 */
export const SCRIPT_MARK = { supOpen: "\uE000", supClose: "\uE001", subOpen: "\uE002", subClose: "\uE003" } as const;

export type SandboxOutput =
  | { kind: "pdf"; pages: Array<{ num: number; text: string }>; total: number; truncated: boolean }
  /** `equations`: Word equations turned into text; `images`: pictures skipped (text only). */
  | { kind: "docx"; html: string; truncated: boolean; equations: number; images: number }
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
const SUP = ["\uE000", "\uE001"];
const SUB = ["\uE002", "\uE003"];
const sup = (text) => (text ? SUP[0] + text + SUP[1] : "");
const sub = (text) => (text ? SUB[0] + text + SUB[1] : "");

// --- Word equations (OMML), which mammoth drops: each becomes a run of plain text, "s = ut + 1/2 at²".
const MATH = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const kids = (node) => (node ? Array.from(node.childNodes).filter((child) => child.nodeType === 1) : []);
const child = (node, name) => kids(node).find((item) => item.localName === name);
const attr = (node, name, fallback) => {
  if (!node) return fallback;
  const value = node.getAttributeNS(MATH, name) || node.getAttribute("m:" + name);
  return value || fallback;
};
const seq = (node) => kids(node).map(linear).join("");
const atomic = (text) => /^[\p{L}\p{N}.,]+$/u.test(text) || /^\(.*\)$/.test(text);
const group = (text) => (atomic(text) ? text : "(" + text + ")");
function linear(node) {
  const name = node.localName;
  if (name.endsWith("Pr")) return "";
  switch (name) {
    case "r":
      return kids(node).filter((item) => item.localName === "t").map((item) => item.textContent).join("");
    case "t":
      return node.textContent;
    case "f":
      return group(seq(child(node, "num"))) + "/" + group(seq(child(node, "den")));
    case "sSup":
      return seq(child(node, "e")) + sup(seq(child(node, "sup")));
    case "sSub":
      return seq(child(node, "e")) + sub(seq(child(node, "sub")));
    case "sSubSup":
      return seq(child(node, "e")) + sub(seq(child(node, "sub"))) + sup(seq(child(node, "sup")));
    case "sPre":
      return sub(seq(child(node, "sub"))) + sup(seq(child(node, "sup"))) + seq(child(node, "e"));
    case "rad": {
      const degree = seq(child(node, "deg"));
      return (degree ? sup(degree) : "") + "√" + group(seq(child(node, "e")));
    }
    case "nary": {
      const symbol = attr(child(child(node, "naryPr"), "chr"), "val", "∫");
      return symbol + sub(seq(child(node, "sub"))) + sup(seq(child(node, "sup"))) + " " + seq(child(node, "e"));
    }
    case "d": {
      const props = child(node, "dPr");
      const open = attr(child(props, "begChr"), "val", "(");
      const close = attr(child(props, "endChr"), "val", ")");
      const separator = attr(child(props, "sepChr"), "val", "|");
      return open + kids(node).filter((item) => item.localName === "e").map(seq).join(separator) + close;
    }
    case "func": {
      const argument = seq(child(node, "e"));
      return seq(child(node, "fName")) + (atomic(argument) ? " " + argument : argument.startsWith("(") ? argument : "(" + argument + ")");
    }
    case "acc":
      return seq(child(node, "e")) + attr(child(child(node, "accPr"), "chr"), "val", "̂");
    case "bar":
      return seq(child(node, "e")) + "̅";
    case "limLow":
      return seq(child(node, "e")) + sub(seq(child(node, "lim")));
    case "limUpp":
      return seq(child(node, "e")) + sup(seq(child(node, "lim")));
    case "eqArr":
      return kids(node).filter((item) => item.localName === "e").map(seq).join("; ");
    case "m":
      return "[" + kids(node).filter((item) => item.localName === "mr").map((row) => kids(row).filter((item) => item.localName === "e").map(seq).join(" ")).join("; ") + "]";
    default:
      return seq(node);
  }
}
const inside = (node, name) => {
  for (let parent = node.parentNode; parent; parent = parent.parentNode) if (parent.localName === name && parent.namespaceURI === MATH) return true;
  return false;
};
async function linearizeMath(input) {
  const JSZip = (await import("jszip")).default;
  const { DOMParser, XMLSerializer } = await import("@xmldom/xmldom");
  const zip = await JSZip.loadAsync(input);
  const file = zip.file("word/document.xml");
  if (!file) return { buffer: input, equations: 0 };
  // Most documents have no equations: look for one while streaming, without holding the whole XML.
  const hasMath = await new Promise((resolve, reject) => {
    let tail = "";
    let found = false;
    file
      .nodeStream()
      .on("data", (chunk) => {
        if (found) return;
        const text = tail + chunk.toString("latin1");
        if (text.indexOf("oMath") >= 0) {
          found = true;
          resolve(true);
        }
        tail = text.slice(-8);
      })
      .on("end", () => resolve(found))
      .on("error", reject);
  });
  if (!hasMath) return { buffer: input, equations: 0 };
  const xml = await file.async("string");
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const replace = (node, text) => {
    const run = doc.createElementNS(WORD, "w:r");
    const textNode = doc.createElementNS(WORD, "w:t");
    textNode.setAttribute("xml:space", "preserve");
    textNode.appendChild(doc.createTextNode(text));
    run.appendChild(textNode);
    node.parentNode.replaceChild(run, node);
  };
  let equations = 0;
  // Display equations (one or more in a paragraph of their own), then the inline ones.
  for (const para of Array.from(doc.getElementsByTagNameNS(MATH, "oMathPara"))) {
    if (!para.parentNode || inside(para, "oMathPara")) continue;
    const maths = kids(para).filter((item) => item.localName === "oMath");
    equations += maths.length;
    replace(para, maths.map(linear).join("; "));
  }
  for (const math of Array.from(doc.getElementsByTagNameNS(MATH, "oMath"))) {
    if (!math.parentNode || inside(math, "oMathPara") || inside(math, "oMath")) continue;
    equations += 1;
    replace(math, linear(math));
  }
  zip.file("word/document.xml", new XMLSerializer().serializeToString(doc));
  return { buffer: await zip.generateAsync({ type: "nodebuffer" }), equations };
}

// --- PDF text with raised and lowered text marked: pdf-parse's own line rules, plus scripts.
async function pdfPageText(page) {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const out = [];
  let lastX;
  let lastY;
  let lineHeight = 0;
  // The line's baseline and body size: what a smaller, raised or lowered item is measured against.
  let baseY;
  let baseSize = 0;
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const size = Math.hypot(item.transform[2], item.transform[3]) || item.height || 0;
    let text = item.str;
    // A shorter item set above or below the line's baseline, right after the text it belongs to ("10" "23").
    const touching = lastX !== undefined && x - lastX < Math.max(2, baseSize * 0.5);
    const offset = baseY === undefined ? 0 : Math.abs(y - baseY);
    const script = text.trim() !== "" && baseSize > 0 && size > 0 && size < baseSize * 0.85 && touching && offset > baseSize * 0.15 && offset < baseSize;
    if (script) {
      while (out.length && out[out.length - 1] !== "\n" && out[out.length - 1].trim() === "") out.pop();
      out.push(y < baseY ? sup(text.trim()) : sub(text.trim()));
      lastX = x + item.width;
      continue;
    }
    const sameLine = lastY !== undefined && Math.abs(lastY - y) <= 4.6;
    if (lastY !== undefined && !sameLine) {
      const previous = out.length ? out[out.length - 1] : undefined;
      const startsLine = text.startsWith("\n") || (text.trim() === "" && item.hasEOL);
      if (previous !== undefined && !previous.endsWith("\n") && !startsLine && Math.abs(lastY - y) - 1 > lineHeight) {
        out.push("\n");
        lineHeight = 0;
      }
    }
    const newLine = !out.length || out[out.length - 1].endsWith("\n");
    if (newLine || baseY === undefined || !sameLine) {
      baseY = y;
      baseSize = size;
    } else if (size > baseSize) {
      baseSize = size;
    }
    if (sameLine && lastX !== undefined && Math.abs(lastX - x) > 7) text = "\t" + text;
    out.push(text);
    lastX = x + item.width;
    lastY = y;
    lineHeight = Math.max(lineHeight, item.height);
    if (item.hasEOL) out.push("\n");
    if (item.hasEOL || text.endsWith("\n")) lineHeight = 0;
  }
  return out.join("");
}

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
        // pdf.js's own document when pdf-parse exposes it (raised and lowered text marked); pdf-parse's text otherwise.
        const doc = parser.doc;
        const pageText = doc && typeof doc.getPage === "function" ? await pdfPageText(await doc.getPage(num)) : ((await parser.getText({ partial: [num] })).pages[0] || {}).text || "";
        const text = pageText.slice(0, maxChars - chars);
        chars += text.length;
        pages.push({ num, text });
      }
      result = { kind, pages, total, truncated: pages.length < total };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } else if (kind === "docx") {
    const mammoth = (await import("mammoth")).default;
    // Word equations become text first; a document whose XML can't be rewritten is read as it is.
    let prepared = { buffer: input, equations: 0 };
    try {
      prepared = await linearizeMath(input);
    } catch {
      prepared = { buffer: input, equations: 0 };
    }
    // Images are not needed for text: skip their base64 copies entirely (and count them, to say so).
    let images = 0;
    const options = { convertImage: mammoth.images.imgElement(async () => { images += 1; return { src: "" }; }) };
    const { value } = await mammoth.convertToHtml({ buffer: prepared.buffer }, options);
    result = { kind, html: value.slice(0, maxChars), truncated: value.length > maxChars, equations: prepared.equations, images };
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
