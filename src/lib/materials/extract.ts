import "server-only";

import { getAiProvider } from "@/lib/ai";
import { charsetOf, decodeText, type TextEncoding } from "@/lib/materials/detect";
import { EXTRACTION_LIMITS, extractInSandbox, SandboxError, SCRIPT_MARK, type SandboxKind, type SandboxOutput } from "@/lib/materials/extract-sandbox";
import type { MaterialSource } from "@/lib/supabase/database.types";

/** A page or section of extracted text, in reading order. */
export type ExtractedSection = {
  /** 1-based page number for paginated sources; null for flowing text. */
  page: number | null;
  text: string;
};

export type ExtractionResult = {
  sections: ExtractedSection[];
  pageCount: number | null;
  /** How the text was obtained; shown to the student for transparency. */
  method: "pdf-text" | "docx" | "doc" | "plain-text" | "ai-vision";
  /** True when only the first part was read (EXTRACTION_LIMITS: pages or characters). */
  truncated?: boolean;
  /** What the student should know about how the text was read (equations converted, pictures skipped). */
  notes?: string[];
};

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

const EMPTY_TEXT_MESSAGE =
  "No readable text was found. If this is a scanned document, upload the pages as images so RevTaw can transcribe them.";

export async function extractText(
  source: MaterialSource,
  bytes: Uint8Array,
  mime: string,
): Promise<ExtractionResult> {
  switch (source) {
    case "pdf":
      return extractPdf(bytes);
    case "docx":
      return extractDocx(bytes);
    case "doc":
      return extractDoc(bytes);
    case "text":
      return extractPlainText(bytes, charsetOf(mime));
    case "image":
      return extractImage(bytes, mime);
  }
}

/** What a student sees when the sandbox gives up on a file, by reason. */
function sandboxFailure(kind: SandboxKind, error: unknown, unreadable: string): ExtractionError {
  if (error instanceof SandboxError) {
    if (error.reason === "timeout") {
      return new ExtractionError("This file took too long to read. Try splitting it into smaller files and uploading them separately.", error.message);
    }
    // A parser that crashes on a file has almost always run into the memory cap.
    if (error.reason === "memory" || error.reason === "output" || error.reason === "crashed") {
      return new ExtractionError("This file is too large or complex to read. Try splitting it into smaller files, or save it again and re-upload.", error.message);
    }
    return new ExtractionError(unreadable, error.message);
  }
  return new ExtractionError(unreadable, `${kind}: ${error instanceof Error ? error.message : String(error)}`);
}

async function runSandbox<K extends SandboxKind>(kind: K, bytes: Uint8Array, unreadable: string): Promise<Extract<SandboxOutput, { kind: K }>> {
  try {
    return (await extractInSandbox(kind, bytes)) as Extract<SandboxOutput, { kind: K }>;
  } catch (error) {
    throw sandboxFailure(kind, error, unreadable);
  }
}

/** A line that is only a page number ("12", "Page 3", "- 4 -", "5 of 20", "Pahina 6"). */
const PAGE_NUMBER_LINE = /^\s*(?:page|pahina|p\.)?\s*[-–—(]?\s*\d{1,4}\s*(?:(?:of|sa|\/)\s*\d{1,4})?\s*[-–—)]?\s*$/i;

/** Whether a page has text to study: a scanned page has none, or only its page-number footer. */
export function hasReadableText(text: string): boolean {
  const body = text
    .split("\n")
    .filter((line) => !PAGE_NUMBER_LINE.test(line))
    .join(" ");
  return (body.match(/\p{L}/gu) ?? []).length >= 3;
}

/** Page numbers as short ranges: [2, 5, 6, 7, 9] → "2, 5–7 and 9". */
export function pageList(pages: number[]): string {
  const ranges: string[] = [];
  for (let index = 0; index < pages.length; ) {
    let end = index;
    while (end + 1 < pages.length && pages[end + 1] === pages[end] + 1) end += 1;
    ranges.push(end > index ? `${pages[index]}–${pages[end]}` : String(pages[index]));
    index = end + 1;
  }
  return ranges.length > 1 ? `${ranges.slice(0, -1).join(", ")} and ${ranges[ranges.length - 1]}` : (ranges[0] ?? "");
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  const result = await runSandbox("pdf", bytes, "This PDF could not be read. It may be damaged or password-protected.");
  const pages = result.pages.map((page) => ({ page: page.num, text: normalizeWhitespace(formatScripts(page.text)) }));
  // Scanned or image-only pages have no text layer (at most a page number): nothing can be read from them.
  const sections = pages.filter((section) => hasReadableText(section.text));
  if (sections.length === 0) {
    throw new ExtractionError(EMPTY_TEXT_MESSAGE, "pdf contained no readable text layer");
  }
  const unreadable = pages.filter((section) => !hasReadableText(section.text)).map((section) => section.page);
  const notes = unreadable.length
    ? [
        `${unreadable.length === 1 ? `Page ${unreadable[0]} has` : `Pages ${pageList(unreadable)} have`} no readable text (scanned or image-only), so nothing was made from ${unreadable.length === 1 ? "it" : "them"}. To include ${unreadable.length === 1 ? "it" : "them"}, upload ${unreadable.length === 1 ? "that page" : "those pages"} as photos or screenshots.`,
      ]
    : [];
  return { sections, pageCount: result.total, method: "pdf-text", truncated: result.truncated, ...(notes.length ? { notes } : {}) };
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractionResult> {
  // HTML keeps heading structure, which makes for better section titles.
  const result = await runSandbox("docx", bytes, "This Word document could not be read. Try saving it again as .docx.");
  const text = htmlToText(result.html);
  if (text.length === 0) {
    throw new ExtractionError(EMPTY_TEXT_MESSAGE, "docx contained no text");
  }
  const notes = [
    result.equations > 0 ? `${result.equations === 1 ? "An equation was" : `${result.equations} equations were`} turned into plain text (like "s = ut + 1/2 at²"); check formulas against your file.` : null,
    result.images > 0 ? `${result.images === 1 ? "A picture was" : `${result.images} pictures were`} skipped: RevTaw reads the text of a document, not its images. Upload a picture on its own to have it read.` : null,
  ].filter((note): note is string => note !== null);
  return { sections: [{ page: null, text }], pageCount: null, method: "docx", truncated: result.truncated, ...(notes.length ? { notes } : {}) };
}

async function extractDoc(bytes: Uint8Array): Promise<ExtractionResult> {
  const result = await runSandbox("doc", bytes, "This Word document could not be read. Try saving it as .docx and uploading again.");
  const text = normalizeWhitespace(result.text);
  if (text.length === 0) {
    throw new ExtractionError(EMPTY_TEXT_MESSAGE, "doc contained no text");
  }
  return { sections: [{ page: null, text }], pageCount: null, method: "doc", truncated: result.truncated };
}

function extractPlainText(bytes: Uint8Array, encoding: TextEncoding): ExtractionResult {
  const decoded = decodeText(bytes, encoding);
  const truncated = decoded.length > EXTRACTION_LIMITS.maxChars;
  const text = normalizeWhitespace(truncated ? decoded.slice(0, EXTRACTION_LIMITS.maxChars) : decoded);
  if (text.length === 0) {
    throw new ExtractionError("This file is empty.", "empty text file");
  }
  return { sections: [{ page: null, text }], pageCount: null, method: "plain-text", truncated };
}

async function extractImage(bytes: Uint8Array, mime: string): Promise<ExtractionResult> {
  const provider = getAiProvider("fast");
  if (!provider.supportsVision) {
    throw new ExtractionError(
      "Reading images needs an AI provider with image support. Ask the administrator to configure one.",
      `provider ${provider.name} lacks vision`,
    );
  }

  const result = await provider.generate({
    task: "ocr_image",
    system:
      "You transcribe study materials from images for a student. Return the complete text exactly as written, " +
      "preserving headings, lists, formulas and table rows (one row per line). Describe diagrams briefly in " +
      "square brackets, e.g. [Diagram: water cycle with evaporation and condensation]. Do not add commentary. " +
      "If the image contains no readable text, reply with exactly: NO_TEXT_FOUND",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", mimeType: mime, data: Buffer.from(bytes).toString("base64") },
          { type: "text", text: "Transcribe this study material." },
        ],
      },
    ],
    maxTokens: 4096,
    temperature: 0,
  });

  const text = normalizeWhitespace(result.text);
  if (!text || /^NO_TEXT_FOUND\b/.test(text)) {
    throw new ExtractionError(
      "No readable text was found in this image. Try a sharper photo or a screenshot with larger text.",
      "vision model found no text",
    );
  }
  return { sections: [{ page: 1, text }], pageCount: 1, method: "ai-vision" };
}

/** Collapses runs of blank lines and trailing spaces while keeping paragraphs. */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => {
      // Indentation stays (it carries the meaning of code and outlines); runs of spaces inside a line don't.
      const [, indent, rest] = /^([ \t]*)(.*)$/.exec(line) ?? ["", "", line];
      const body = rest.replace(/[ \t]+$/g, "").replace(/[ \t]{2,}/g, " ");
      return body ? `${indent.replace(/\t/g, "    ").slice(0, 24)}${body}` : "";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\s+$/g, "");
}

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ",
};
const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", h: "ₕ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", p: "ₚ", s: "ₛ", t: "ₜ", i: "ᵢ", j: "ⱼ", r: "ᵣ", u: "ᵤ", v: "ᵥ",
};

/**
 * Superscript or subscript text written so it can't be misread: Unicode where every character has a form
 * ("10²³", "H₂O", "m/s²"), otherwise a caret or underscore ("x^(n+1)", "v_max"). Letters set high that read as
 * words (the "st" of "1st") stay plain.
 */
export function scriptText(kind: "sup" | "sub", value: string): string {
  const text = value.trim();
  if (!text) return "";
  const table = kind === "sup" ? SUPERSCRIPT : SUBSCRIPT;
  const characters = [...text];
  if (characters.every((character) => table[character])) return characters.map((character) => table[character]).join("");
  // Ordinals and abbreviations set high ("1st", "Mme") read right as plain letters; so does a footnote mark ("[1]").
  if (kind === "sup" && (/^\p{L}{2,}$/u.test(text) || /^\[\d+\]$/.test(text))) return text;
  const mark = kind === "sup" ? "^" : "_";
  return /^[\p{L}\p{N}]+$/u.test(text) && (kind === "sub" || characters.length === 1) ? `${mark}${text}` : `${mark}(${text})`;
}

/** Writes out the superscript and subscript marks of extracted text (SCRIPT_MARK), innermost first. */
export function formatScripts(text: string): string {
  const { supOpen, supClose, subOpen, subClose } = SCRIPT_MARK;
  const innermost = new RegExp(`${supOpen}([^${supOpen}${supClose}${subOpen}${subClose}]*)${supClose}|${subOpen}([^${supOpen}${supClose}${subOpen}${subClose}]*)${subClose}`, "g");
  let current = text;
  for (let round = 0; round < 8 && innermost.test(current); round += 1) {
    innermost.lastIndex = 0;
    current = current.replace(innermost, (_match, raised: string | undefined, lowered: string | undefined) => (raised !== undefined ? scriptText("sup", raised) : scriptText("sub", lowered ?? "")));
    innermost.lastIndex = 0;
  }
  // A mark left unmatched (cut text) is dropped rather than shown.
  return current.replace(new RegExp(`[${supOpen}${supClose}${subOpen}${subClose}]`, "g"), "");
}

/** Minimal HTML → text that turns headings into their own lines and keeps list items. */
export function htmlToText(html: string): string {
  const { supOpen, supClose, subOpen, subClose } = SCRIPT_MARK;
  const withScripts = html
    .replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_match, inner: string) => `${supOpen}${inner.replace(/<[^>]+>/g, "")}${supClose}`)
    .replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_match, inner: string) => `${subOpen}${inner.replace(/<[^>]+>/g, "")}${subClose}`);
  const withBreaks = listsToText(tablesToText(withScripts))
    .replace(/<\/(h[1-6])>/gi, "\n\n")
    .replace(/<(h[1-6])[^>]*>/gi, "\n\n")
    .replace(/<\/p>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return normalizeWhitespace(formatScripts(decodeEntities(withBreaks)));
}

/** A cell's or item's text on one line: its paragraphs joined, tags gone. */
function inlineText(html: string): string {
  return html
    .replace(/<\/p>\s*<p[^>]*>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tables as one line per row, cells separated by " | " and empty cells kept, so a value stays in its column
 * ("Acceleration | | m/s²" rather than "Acceleration" then "m/s²" on the next line).
 */
function tablesToText(html: string): string {
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_table, body: string) => {
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => inlineText(cell[1])));
    return `\n\n${rows.filter((cells) => cells.some(Boolean)).map((cells) => cells.join(" | ")).join("\n")}\n\n`;
  });
}

/** Lists with their nesting (two spaces a level) and their numbers: "1. Mitosis" then "  • Prophase". */
function listsToText(html: string): string {
  const stack: Array<{ ordered: boolean; count: number }> = [];
  return html.replace(/<(\/?)(ul|ol|li)\b[^>]*>/gi, (_tag, closing: string, name: string) => {
    const tag = name.toLowerCase();
    if (tag === "li") {
      if (closing) return "";
      const list = stack[stack.length - 1];
      if (!list) return "\n• ";
      list.count += 1;
      return `\n${"  ".repeat(stack.length - 1)}${list.ordered ? `${list.count}. ` : "• "}`;
    }
    if (closing) {
      stack.pop();
      return stack.length ? "" : "\n\n";
    }
    stack.push({ ordered: tag === "ol", count: 0 });
    return "";
  });
}

const NAMED_ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** One pass, so "&amp;lt;" stays "&lt;" (the text the student wrote) instead of turning into "<". */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity: string, body: string) => {
    if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}
