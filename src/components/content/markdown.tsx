import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Minimal markdown renderer for AI-generated study content. It understands
 * paragraphs, headings, bullet and numbered lists (one nesting level, numbered
 * lists keep their numbers), tables, code fences (with their language), bold,
 * italic and inline code — and nothing else, so no raw HTML or links can slip
 * through from a model response.
 */

type Align = "left" | "center" | "right" | null;

type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "list"; ordered: boolean; start: number; items: Array<{ text: string; children: string[] }> }
  | { type: "code"; text: string; lang: string | null }
  | { type: "table"; header: string[]; align: Align[]; rows: string[][] };

const BULLET = /^(\s*)(?:[-*•]|\d+[.)])\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** A table starts with a row of cells followed by a separator row (| --- | :---: |). */
function startsTable(lines: string[], index: number): boolean {
  return lines[index].includes("|") && index + 1 < lines.length && TABLE_SEPARATOR.test(lines[index + 1]) && lines[index + 1].includes("-");
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*```/.test(line)) {
      const lang = line.trim().slice(3).trim().split(/\s+/)[0]?.replace(/[^\w#+.-]/g, "") || null;
      const buffer: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        buffer.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ type: "code", text: buffer.join("\n"), lang });
      continue;
    }

    if (startsTable(lines, index)) {
      const header = tableCells(line);
      const align: Align[] = tableCells(lines[index + 1]).map((cell) => (cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : null));
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const cells = tableCells(lines[index]);
        // Every row has the header's columns, so a ragged row neither drops nor shifts cells.
        rows.push(header.map((_, column) => cells[column] ?? ""));
        index += 1;
      }
      blocks.push({ type: "table", header, align: header.map((_, column) => align[column] ?? null), rows });
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    const bullet = line.match(BULLET);
    if (bullet) {
      const ordered = /^\s*\d+[.)]/.test(line);
      // Steps split by a paragraph ("1." … text … "2.") keep counting instead of starting at 1 again.
      const start = ordered ? Number(line.match(/^\s*(\d+)/)?.[1] ?? 1) : 1;
      const items: Array<{ text: string; children: string[] }> = [];
      while (index < lines.length) {
        const match = lines[index].match(BULLET);
        if (!match) break;
        const indent = match[1].length;
        // A switch between bullets and numbers at the top level starts a new list.
        if (indent < 2 && /^\s*\d+[.)]/.test(lines[index]) !== ordered) break;
        if (indent >= 2 && items.length > 0) {
          items[items.length - 1].children.push(match[2].trim());
        } else {
          items.push({ text: match[2].trim(), children: [] });
        }
        index += 1;
      }
      blocks.push({ type: "list", ordered, start, items });
      continue;
    }

    const buffer: string[] = [];
    while (index < lines.length && lines[index].trim() && !BULLET.test(lines[index]) && !/^(#{1,6})\s/.test(lines[index]) && !/^\s*```/.test(lines[index]) && !startsTable(lines, index)) {
      buffer.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: buffer.join(" ") });
  }

  return blocks;
}

/**
 * Inline marks: `code`, **bold**, *italic* and _italic_. A mark opens only before a non-space and closes only
 * after one, and a single * or _ never sits inside a word or number, so math stays math: "V = l * w * h",
 * "2*3*4" and "a_1 + a_2" are not emphasis.
 */
const INLINE = /`([^`]+)`|\*\*(?=\S)([^*]*?\S)\*\*|(?<![\p{L}\p{N}*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\p{L}\p{N}_])/gu;

export function renderInline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(<Fragment key={nodes.length}>{text.slice(last, start)}</Fragment>);
    const [, code, strong, starred, underscored] = match;
    if (code !== undefined) {
      nodes.push(
        <code key={nodes.length} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {code}
        </code>,
      );
    } else if (strong !== undefined) {
      nodes.push(<strong key={nodes.length}>{strong}</strong>);
    } else {
      nodes.push(<em key={nodes.length}>{starred ?? underscored}</em>);
    }
    last = start + match[0].length;
  }
  if (last < text.length) nodes.push(<Fragment key={nodes.length}>{text.slice(last)}</Fragment>);
  return nodes;
}

export function Markdown({ source, className, lang }: { source: string; className?: string; lang?: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div lang={lang} className={cn("flex flex-col gap-3 text-reading text-foreground/90", className)}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            const Tag = block.level <= 2 ? "h3" : "h4";
            return (
              <Tag key={index} className={cn("font-semibold text-foreground", block.level <= 2 ? "mt-2 text-base" : "text-sm")}>
                {renderInline(block.text)}
              </Tag>
            );
          }
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={index} start={block.ordered && block.start !== 1 ? block.start : undefined} className={cn("space-y-1.5 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    {renderInline(item.text)}
                    {item.children.length > 0 && (
                      <ul className="mt-1 list-[circle] space-y-1 pl-5">
                        {item.children.map((child, childIndex) => (
                          <li key={childIndex}>{renderInline(child)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </Tag>
            );
          }
          case "code":
            return (
              <figure key={index} className="flex flex-col overflow-hidden rounded-lg bg-muted">
                {block.lang && <figcaption className="border-b border-border px-3 py-1 font-mono text-2xs uppercase tracking-wide text-muted-foreground">{block.lang}</figcaption>}
                <pre className="overflow-x-auto px-3 py-2 font-mono text-sm">
                  <code>{block.text}</code>
                </pre>
              </figure>
            );
          case "table":
            return (
              <div key={index} className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      {block.header.map((cell, column) => (
                        <th key={column} scope="col" style={{ textAlign: block.align[column] ?? undefined }} className="border-b border-border px-3 py-2 text-left font-semibold text-foreground">
                          {renderInline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-border last:border-b-0">
                        {row.map((cell, column) => (
                          <td key={column} style={{ textAlign: block.align[column] ?? undefined }} className="px-3 py-2 align-top">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <p key={index}>{renderInline(block.text)}</p>;
        }
      })}
    </div>
  );
}
