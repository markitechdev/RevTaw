import "server-only";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import WordExtractor from "word-extractor";

import { getAiProvider } from "@/lib/ai";
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
      return extractPlainText(bytes);
    case "image":
      return extractImage(bytes, mime);
  }
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  // pdf.js transfers the buffer to its worker; hand it a copy so callers keep theirs.
  const parser = new PDFParse({ data: bytes.slice() });
  try {
    const result = await parser.getText();
    const sections = result.pages
      .map((page) => ({ page: page.num, text: normalizeWhitespace(page.text) }))
      .filter((section) => section.text.length > 0);
    if (sections.length === 0) {
      throw new ExtractionError(EMPTY_TEXT_MESSAGE, "pdf contained no text layer");
    }
    return { sections, pageCount: result.total, method: "pdf-text" };
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(
      "This PDF could not be read. It may be damaged or password-protected.",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractionResult> {
  try {
    // HTML keeps heading structure, which makes for better section titles.
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
    const text = htmlToText(value);
    if (text.length === 0) {
      throw new ExtractionError(EMPTY_TEXT_MESSAGE, "docx contained no text");
    }
    return { sections: [{ page: null, text }], pageCount: null, method: "docx" };
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(
      "This Word document could not be read. Try saving it again as .docx.",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function extractDoc(bytes: Uint8Array): Promise<ExtractionResult> {
  try {
    const extractor = new WordExtractor();
    const document = await extractor.extract(Buffer.from(bytes));
    const text = normalizeWhitespace(document.getBody());
    if (text.length === 0) {
      throw new ExtractionError(EMPTY_TEXT_MESSAGE, "doc contained no text");
    }
    return { sections: [{ page: null, text }], pageCount: null, method: "doc" };
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(
      "This Word document could not be read. Try saving it as .docx and uploading again.",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function extractPlainText(bytes: Uint8Array): ExtractionResult {
  const text = normalizeWhitespace(new TextDecoder("utf-8").decode(bytes));
  if (text.length === 0) {
    throw new ExtractionError("This file is empty.", "empty text file");
  }
  return { sections: [{ page: null, text }], pageCount: null, method: "plain-text" };
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
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").replace(/[ \t]{2,}/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Minimal HTML → text that turns headings into their own lines and keeps list items. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\/(h[1-6])>/gi, "\n\n")
    .replace(/<(h[1-6])[^>]*>/gi, "\n\n")
    .replace(/<\/p>|<\/li>|<\/tr>|<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/td>|<\/th>/gi, "\t")
    .replace(/<[^>]+>/g, "");
  return normalizeWhitespace(decodeEntities(withBreaks));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}
