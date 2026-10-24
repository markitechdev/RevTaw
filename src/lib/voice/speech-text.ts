import type { ResponseLanguage } from "@/lib/preferences/options";

/**
 * Text helpers for voice mode: what to read aloud, in which language, in
 * which pieces. Pure and client-safe (unit-tested).
 */

const READ_LIMIT = 1400;

/** Markdown → plain sentences worth hearing: no symbols, code or URLs, and long answers stop with a pointer to the screen. */
export function speakableText(markdown: string): string {
  let text = markdown
    .replace(/```[\s\S]*?```/g, "\nThe code is on screen.\n")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, "")
    .replace(/^[ \t]*\|(.*)$/gm, (_, row: string) => row.split("|").map((cell) => cell.trim()).filter(Boolean).join(", "))
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*)$/gm, "$1")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]*(?:[-*+•]|\d+[.)])[ \t]+(.*)$/gm, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/[*#>~]/g, " ");
  text = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/[.!?:;,]$/.test(line) ? line : `${line}.`))
    .join(" ")
    .replace(/\.(\s*\.)+/g, ".")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= READ_LIMIT) return text;
  const cut = text.slice(0, READ_LIMIT);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return `${end > 200 ? cut.slice(0, end + 1) : cut} The rest is on screen.`;
}

/** Long answers are read in sentence-sized pieces: some engines stop a single utterance after about 15 seconds. */
export function speechChunks(text: string, size = 220): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > size && current) {
      chunks.push(current.trim());
      current = "";
    }
    if (sentence.length > size) {
      for (let start = 0; start < sentence.length; start += size) chunks.push(sentence.slice(start, start + size).trim());
      continue;
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

// Function words that are common in Filipino and Taglish and rare in English.
const FILIPINO_WORDS = new Set(["ang", "ng", "mga", "sa", "ay", "na", "ito", "iyan", "yan", "hindi", "ko", "mo", "niya", "natin", "namin", "kasi", "pero", "kung", "lang", "din", "rin", "po", "naman", "talaga", "paano", "bakit", "ano", "dahil", "ba", "nga", "siya", "sila", "tayo", "kami", "ikaw", "ako"]);

/** True when a text reads as Filipino or Taglish (enough Filipino function words). */
export function looksFilipino(text: string): boolean {
  const words = text.toLowerCase().match(/[a-zñ']+/g) ?? [];
  if (words.length === 0) return false;
  const hits = words.filter((word) => FILIPINO_WORDS.has(word)).length;
  return hits >= 2 && hits / words.length >= 0.08;
}

function normalizeTag(tag: string | null | undefined): string {
  const value = (tag ?? "").trim();
  if (!value) return "en-US";
  const base = value.toLowerCase().split(/[-_]/)[0];
  return base === "fil" || base === "tl" ? "fil-PH" : value;
}

/** The language RevTaw listens in: the response language, or the browser's language for Auto and other languages. */
export function listeningLanguage(preference: ResponseLanguage, browserLanguage: string | null | undefined): string {
  if (preference === "en") return "en-US";
  if (preference === "fil" || preference === "taglish") return "fil-PH";
  return normalizeTag(browserLanguage);
}

/** The voice an answer is read in: Filipino for Filipino and Taglish, and for Auto when the answer itself reads as Filipino. */
export function speakingLanguage(preference: ResponseLanguage, text: string, browserLanguage: string | null | undefined): string {
  if (preference === "en") return "en-US";
  if (preference === "fil" || preference === "taglish") return "fil-PH";
  if (preference === "auto" && looksFilipino(text)) return "fil-PH";
  const tag = normalizeTag(browserLanguage);
  return preference === "auto" && tag === "fil-PH" && !looksFilipino(text) ? "en-US" : tag;
}
