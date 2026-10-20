import { parseMarkdown } from "@/components/content/markdown";

/**
 * Export document model (spec §34): what every exportable thing — a
 * reviewer, a quiz, results, a deck, a plan, the mistake notebook, a progress
 * report — is reduced to before it is rendered as PDF, Word or a printable
 * page. One model, three renderers, so the formatting stays readable in all
 * of them. Pure and client-safe.
 */

export type InlineRun = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

export type ExportBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; runs: InlineRun[]; muted?: boolean }
  | { type: "list"; ordered: boolean; items: Array<{ runs: InlineRun[]; children: InlineRun[][] }> }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "keyValues"; items: Array<{ label: string; value: string }> }
  | { type: "callout"; label: string; runs: InlineRun[] }
  | { type: "code"; text: string }
  | { type: "pageBreak" };

export type ExportSection = { heading: string | null; blocks: ExportBlock[] };

export type ExportDocument = {
  title: string;
  subtitle: string | null;
  /** Small facts shown under the title (material, date, counts). */
  meta: string[];
  sections: ExportSection[];
  /** Printed in the footer of every page. */
  footer: string;
};

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_|\*[^*]+\*)/g;

/** Splits markdown inline marks (bold, italic, code) into styled runs; anything else is plain text. */
export function inlineRuns(text: string): InlineRun[] {
  return text
    .split(INLINE)
    .filter((part) => part !== "")
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return { text: part.slice(2, -2), bold: true };
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return { text: part.slice(1, -1), code: true };
      if (((part.startsWith("_") && part.endsWith("_")) || (part.startsWith("*") && part.endsWith("*"))) && part.length > 2) return { text: part.slice(1, -1), italic: true };
      return { text: part };
    });
}

export function plainText(runs: InlineRun[]): string {
  return runs.map((run) => run.text).join("");
}

export const text = (value: string): InlineRun[] => [{ text: value }];

export function paragraph(value: string, muted = false): ExportBlock {
  return { type: "paragraph", runs: inlineRuns(value), muted };
}

export function heading(value: string, level: 2 | 3 = 2): ExportBlock {
  return { type: "heading", level, text: value };
}

export function bullets(items: string[], ordered = false): ExportBlock {
  return { type: "list", ordered, items: items.map((item) => ({ runs: inlineRuns(item), children: [] })) };
}

export function table(columns: string[], rows: string[][]): ExportBlock {
  return { type: "table", columns, rows };
}

export function keyValues(items: Array<{ label: string; value: string }>): ExportBlock {
  return { type: "keyValues", items };
}

export function callout(label: string, value: string): ExportBlock {
  return { type: "callout", label, runs: inlineRuns(value) };
}

/** Markdown (as the reviewers store it) → blocks, keeping headings, lists, paragraphs and code. */
export function markdownBlocks(source: string): ExportBlock[] {
  return parseMarkdown(source).map((block): ExportBlock => {
    switch (block.type) {
      case "heading":
        return { type: "heading", level: block.level <= 2 ? 2 : 3, text: block.text };
      case "list":
        return { type: "list", ordered: block.ordered, items: block.items.map((item) => ({ runs: inlineRuns(item.text), children: item.children.map(inlineRuns) })) };
      case "code":
        return { type: "code", text: block.text };
      default:
        return { type: "paragraph", runs: inlineRuns(block.text) };
    }
  });
}

/** A safe file name from a title: letters, digits, dashes. */
export function fileSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "export";
}

export function formatExportDate(value: string | Date = new Date()): string {
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
