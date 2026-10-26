import type { ExtractedSection } from "@/lib/materials/extract";

export type Chunk = {
  position: number;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  content: string;
};

/** Target size per chunk (characters ≈ tokens × 4). */
export const CHUNK_TARGET_CHARS = 3200;
export const CHUNK_MAX_CHARS = 4800;

/** Small words a title leaves lowercase, English and Filipino ("Mga Uri ng Pangungusap", "Ang Siklo ng Tubig"). */
const TITLE_CONNECTORS = new Set(["of", "and", "the", "in", "for", "to", "a", "an", "on", "at", "by", "vs", "with", "or", "ng", "sa", "mga", "ang", "na", "ni", "nina", "para", "ay"]);

const HEADING_PATTERNS = [
  /^(chapter|unit|lesson|module|section|part|topic)\b[^\n]{0,80}$/i,
  /^\d+(\.\d+)*[.)]?\s+[A-Za-z][^\n]{2,80}$/,
  /^[A-Z][A-Z0-9 ,'&()\-/]{3,80}$/,
  /^#{1,6}\s+\S/,
];

/** "Light-Dependent Reactions", "Calvin Cycle": every significant word capitalised. */
function isTitleCase(line: string): boolean {
  const words = line.split(/\s+/);
  if (words.length < 1 || words.length > 8) return false;
  if (!/^[A-Z]/.test(words[0])) return false;
  return words.every((word) => /^[A-Z][\w'&-]*$/.test(word) || TITLE_CONNECTORS.has(word.toLowerCase()) || /^\d+$/.test(word));
}

/** True for short lines that read like a title rather than a sentence. */
export function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 90) return false;
  // A table row ("Feature | Mitosis | Meiosis") or an indented line (code, a nested list item) is never a title.
  if (trimmed.includes(" | ") || /^\s/.test(line)) return false;
  if (/[.!?;,]$/.test(trimmed)) return false;
  if (trimmed.split(/\s+/).length > 12) return false;
  return HEADING_PATTERNS.some((pattern) => pattern.test(trimmed)) || isTitleCase(trimmed);
}

function cleanHeading(line: string): string {
  return line.trim().replace(/^#{1,6}\s+/, "").slice(0, 200);
}

/**
 * Splits extracted sections into ordered chunks that keep their page range and
 * nearest heading, so later AI features can cite "p. 4, Linked Lists".
 *
 * Paragraphs are never split mid-way unless a single paragraph exceeds the
 * hard limit, in which case it is cut at sentence boundaries.
 */
export function chunkSections(sections: ExtractedSection[]): Chunk[] {
  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let bufferChars = 0;
  let currentHeading: string | null = null;
  let chunkHeading: string | null = null;
  let pageStart: number | null = null;
  let pageEnd: number | null = null;

  const flush = () => {
    const content = buffer.join("\n\n").trim();
    if (content.length > 0) {
      chunks.push({
        position: chunks.length,
        heading: chunkHeading,
        pageStart,
        pageEnd,
        content,
      });
    }
    buffer = [];
    bufferChars = 0;
    chunkHeading = currentHeading;
    pageStart = null;
    pageEnd = null;
  };

  for (const section of sections) {
    // A chunk never spans pages that weren't read (a scanned page between two with text): its range would claim them.
    if (bufferChars > 0 && section.page !== null && pageEnd !== null && section.page > pageEnd + 1) flush();
    for (const paragraph of splitIntoParagraphs(section.text)) {
      const firstLine = paragraph.split("\n")[0] ?? "";
      const headingLine = paragraph.split("\n").length === 1 && isHeadingLine(firstLine);

      if (headingLine) {
        // Start a new chunk at a heading when the current one already has substance.
        if (bufferChars > CHUNK_TARGET_CHARS / 2) flush();
        currentHeading = cleanHeading(firstLine);
        if (bufferChars === 0) chunkHeading = currentHeading;
      }

      for (const piece of splitLongParagraph(paragraph)) {
        if (bufferChars > 0 && bufferChars + piece.length > CHUNK_TARGET_CHARS) {
          flush();
        }
        if (bufferChars === 0) {
          chunkHeading = currentHeading;
          pageStart = section.page;
        }
        buffer.push(piece);
        bufferChars += piece.length + 2;
        pageEnd = section.page ?? pageEnd;
      }
    }
  }
  flush();

  return chunks;
}

/**
 * Breaks text into paragraphs. Blank lines separate paragraphs; heading-like
 * lines always stand alone, which matters for PDFs whose text layer only has
 * single line breaks between paragraphs.
 */
export function splitIntoParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) {
      paragraphs.push(current.join("\n").replace(/\s+$/, ""));
      current = [];
    }
  };

  for (const rawLine of text.split("\n")) {
    // Indentation stays: it is what makes code and nested lists readable.
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) {
      flush();
      continue;
    }
    if (isHeadingLine(line)) {
      flush();
      paragraphs.push(line.trim());
      continue;
    }
    current.push(line);
  }
  flush();
  return paragraphs.filter(Boolean);
}

function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length <= CHUNK_MAX_CHARS) return [paragraph];
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const pieces: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > CHUNK_MAX_CHARS && current) {
      pieces.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
    while (current.length > CHUNK_MAX_CHARS) {
      pieces.push(current.slice(0, CHUNK_MAX_CHARS));
      current = current.slice(CHUNK_MAX_CHARS);
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
