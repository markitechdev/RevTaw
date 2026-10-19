import { FileText } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { isHeadingLine } from "@/lib/materials/chunk";
import type { MaterialChunkView } from "@/lib/materials/queries";

const LIST_MARKER = /^(?:[-•·]|\d+[.)]|[a-z][.)])\s/i;
const STAR_MARKER = /^\*\s/;

/**
 * PDF text layers break lines mid-sentence. Join those soft breaks for reading
 * while keeping list items and lines that end a sentence on their own line.
 * A leading "*" only counts as a bullet when several lines use it, so a
 * multiplication sign at a line start ("base + i\n* size") is joined.
 */
export function joinSoftBreaks(paragraph: string): string {
  const lines = paragraph.split("\n");
  const starBullets = lines.filter((line) => STAR_MARKER.test(line.trim())).length >= 2;
  let output = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!output) {
      output = trimmed;
      continue;
    }
    const previousEndsSentence = /[.!?:;]$/.test(output);
    const isListItem = LIST_MARKER.test(trimmed) || (starBullets && STAR_MARKER.test(trimmed));
    if (isListItem || previousEndsSentence) {
      output += `\n${trimmed}`;
    } else {
      output += ` ${trimmed}`;
    }
  }
  return output;
}

function pageLabel(chunk: MaterialChunkView): string | null {
  if (chunk.page_start === null) return null;
  if (chunk.page_end === null || chunk.page_end === chunk.page_start) return `p. ${chunk.page_start}`;
  return `pp. ${chunk.page_start}–${chunk.page_end}`;
}

/**
 * Extracted text, section by section, with the page range each section came
 * from so students (and later the AI tutor) can trace content back to the file.
 */
export function MaterialContent({ chunks }: { chunks: MaterialChunkView[] }) {
  if (chunks.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No text extracted yet"
        description="Once processing finishes, the readable text of this material appears here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {chunks.map((chunk) => {
        const page = pageLabel(chunk);
        return (
          <section key={chunk.id} id={`section-${chunk.position + 1}`} aria-label={chunk.heading ?? `Section ${chunk.position + 1}`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">
                {chunk.heading ?? `Section ${chunk.position + 1}`}
              </h2>
              <span className="text-xs text-muted-foreground">
                {[page, `${chunk.char_count.toLocaleString()} characters`].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-foreground/90">
              {chunk.content
                .split(/\n{2,}/)
                .filter((paragraph, index) => !(index === 0 && chunk.heading && paragraph.trim() === chunk.heading))
                .map((paragraph, index) =>
                  !paragraph.includes("\n") && isHeadingLine(paragraph) ? (
                    <h3 key={index} className="mt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {paragraph.replace(/^#{1,6}\s+/, "")}
                    </h3>
                  ) : (
                    <p key={index} className="whitespace-pre-wrap">
                      {joinSoftBreaks(paragraph)}
                    </p>
                  ),
                )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
