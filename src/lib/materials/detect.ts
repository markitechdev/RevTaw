import "server-only";

import { fileTypeFromBuffer } from "file-type";

import type { MaterialSource } from "@/lib/supabase/database.types";

export type DetectedType = {
  source: MaterialSource;
  mime: string;
};

const BINARY_SOURCES: Record<string, DetectedType> = {
  "application/pdf": { source: "pdf", mime: "application/pdf" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    source: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  "application/x-cfb": { source: "doc", mime: "application/msword" },
  "application/msword": { source: "doc", mime: "application/msword" },
  "image/png": { source: "image", mime: "image/png" },
  "image/jpeg": { source: "image", mime: "image/jpeg" },
  "image/webp": { source: "image", mime: "image/webp" },
  "image/gif": { source: "image", mime: "image/gif" },
};

/** Encodings a text file or pasted note is read in. */
export type TextEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

/**
 * Text formats whose markup would become the material word for word (an RTF file read as text is mostly
 * "\\par" and font tables): rejected rather than read as notes.
 */
const MARKUP_FORMATS = new Set(["application/rtf"]);

/**
 * Determines what a file really is from its bytes ("magic numbers"), never
 * from the extension or the browser-supplied MIME type. Returns null when the
 * content is not one of the supported kinds.
 *
 * A DOCX is a ZIP archive; `file-type` recognizes it by inspecting the
 * central directory, so a renamed .zip is rejected rather than treated as a
 * document.
 *
 * Plain text has no magic number, and plenty of notes begin with one that
 * isn't a supported kind ("BMI is…" starts like a bitmap, "ID3 is a decision
 * tree…" like an MP3): bytes that decode as text are text. A text file's
 * encoding is detected (UTF-8, UTF-16 with or without a byte-order mark, or
 * Windows "ANSI") and kept in the MIME type's charset.
 */
export async function detectMaterialType(bytes: Uint8Array): Promise<DetectedType | null> {
  const detected = await fileTypeFromBuffer(bytes);
  const binary = detected ? BINARY_SOURCES[detected.mime] : undefined;
  if (binary) return binary;
  if (detected && MARKUP_FORMATS.has(detected.mime)) return null;

  const encoding = textEncoding(bytes);
  if (!encoding) return null;
  return { source: "text", mime: encoding === "utf-8" ? "text/plain" : `text/plain; charset=${encoding}` };
}

/** The charset a stored text MIME type names ("text/plain; charset=windows-1252"); UTF-8 when it names none. */
export function charsetOf(mime: string | null | undefined): TextEncoding {
  const charset = /;\s*charset=([\w-]+)/i.exec(mime ?? "")?.[1]?.toLowerCase();
  return charset === "utf-16le" || charset === "utf-16be" || charset === "windows-1252" ? charset : "utf-8";
}

/**
 * Windows-1252's characters for bytes 0x80-0x9F (curly quotes, dashes, "…", "€"); undefined bytes keep their
 * Latin-1 value. Spelled out because Node's TextDecoder reads "windows-1252" as Latin-1, which turns "“" into
 * a control character.
 */
const WINDOWS_1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

/** Decodes text in its encoding; a byte-order mark is dropped, and a stray invalid byte becomes "�" rather than failing. */
export function decodeText(bytes: Uint8Array, encoding: TextEncoding, options: { stream?: boolean } = {}): string {
  if (encoding !== "windows-1252") return new TextDecoder(encoding).decode(bytes, options);
  let text = "";
  for (let start = 0; start < bytes.length; start += 8192) {
    const codes = Array.from(bytes.subarray(start, start + 8192), (byte) => (byte >= 0x80 && byte <= 0x9f ? WINDOWS_1252_HIGH[byte - 0x80] : byte));
    text += String.fromCharCode(...codes);
  }
  return text;
}

/** The encoding the bytes are text in, or null when they aren't text. */
export function textEncoding(bytes: Uint8Array): TextEncoding | null {
  if (bytes.length === 0) return null;
  const encoding = bomEncoding(bytes) ?? utf16WithoutBom(bytes) ?? (mostlyUtf8(bytes) ? "utf-8" : "windows-1252");
  // A sample is enough to tell text from binary; streaming leaves a character cut at its end undecoded.
  const text = decodeText(bytes.subarray(0, 64_000), encoding, { stream: true });
  return looksLikeText(text) ? encoding : null;
}

/** Whether decoded text reads as text: no NUL characters and almost no other control characters. */
export function looksLikeText(text: string): boolean {
  if (text.length === 0) return false;
  let control = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0) return false;
    if ((code < 32 && code !== 9 && code !== 10 && code !== 12 && code !== 13) || (code >= 0x80 && code <= 0x9f)) control += 1;
  }
  return control / text.length < 0.01;
}

function bomEncoding(bytes: Uint8Array): TextEncoding | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  return null;
}

/** UTF-16 saved without a byte-order mark: ASCII-range text leaves every other byte zero. */
function utf16WithoutBom(bytes: Uint8Array): TextEncoding | null {
  const length = Math.min(bytes.length, 4096) & ~1;
  if (length < 8) return null;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let index = 0; index < length; index += 2) {
    if (bytes[index] === 0) evenZeros += 1;
    if (bytes[index + 1] === 0) oddZeros += 1;
  }
  const pairs = length / 2;
  if (oddZeros / pairs > 0.3 && evenZeros / pairs < 0.05) return "utf-16le";
  if (evenZeros / pairs > 0.3 && oddZeros / pairs < 0.05) return "utf-16be";
  return null;
}

/**
 * Whether the bytes are UTF-8: plain ASCII, or text whose non-ASCII bytes form valid UTF-8 characters. A few
 * stray bytes in a UTF-8 file (text pasted in from elsewhere) don't make it "ANSI": that would garble every
 * accented letter to fix a handful.
 */
function mostlyUtf8(bytes: Uint8Array): boolean {
  let valid = 0;
  let invalid = 0;
  for (let index = 0; index < bytes.length; ) {
    const byte = bytes[index];
    if (byte < 0x80) {
      index += 1;
      continue;
    }
    const length = byte >= 0xc2 && byte <= 0xdf ? 2 : byte >= 0xe0 && byte <= 0xef ? 3 : byte >= 0xf0 && byte <= 0xf4 ? 4 : 0;
    let ok = length > 0 && index + length <= bytes.length;
    for (let next = 1; ok && next < length; next += 1) ok = (bytes[index + next] & 0xc0) === 0x80;
    if (ok) {
      valid += 1;
      index += length;
    } else {
      invalid += 1;
      index += 1;
    }
  }
  return invalid === 0 || (valid > 0 && invalid * 10 <= valid);
}
