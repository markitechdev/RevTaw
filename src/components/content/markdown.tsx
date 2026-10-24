import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Minimal markdown renderer for AI-generated study content. It understands
 * paragraphs, headings, bullet and numbered lists (one nesting level), code
 * fences, bold, italic and inline code — and nothing else, so no raw HTML or
 * links can slip through from a model response.
 */

type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "list"; ordered: boolean; items: Array<{ text: string; children: string[] }> }
  | { type: "code"; text: string };

const BULLET = /^(\s*)(?:[-*•]|\d+[.)])\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*```/.test(line)) {
      const buffer: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        buffer.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ type: "code", text: buffer.join("\n") });
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
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const buffer: string[] = [];
    while (index < lines.length && lines[index].trim() && !BULLET.test(lines[index]) && !/^(#{1,6})\s/.test(lines[index]) && !/^\s*```/.test(lines[index])) {
      buffer.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: buffer.join(" ") });
  }

  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_|\*[^*]+\*)/g;

export function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE).filter((part) => part !== "");
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if ((part.startsWith("_") && part.endsWith("_")) || (part.startsWith("*") && part.endsWith("*"))) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function Markdown({ source, className, lang }: { source: string; className?: string; lang?: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div lang={lang} className={cn("flex flex-col gap-3 text-[15px] leading-relaxed text-foreground/90", className)}>
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
              <Tag key={index} className={cn("space-y-1.5 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
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
              <pre key={index} className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-sm">
                <code>{block.text}</code>
              </pre>
            );
          default:
            return <p key={index}>{renderInline(block.text)}</p>;
        }
      })}
    </div>
  );
}
