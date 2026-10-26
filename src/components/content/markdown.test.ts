import { describe, expect, it } from "vitest";

import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { parseMarkdown, renderInline } from "@/components/content/markdown";

describe("parseMarkdown", () => {
  it("parses paragraphs, headings, lists and code fences", () => {
    const blocks = parseMarkdown("## Topic\nFirst line\nsecond line\n\n- one\n- two\n  - nested\n1. first\n\n```\nx = 1\n```");
    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "Topic" },
      { type: "paragraph", text: "First line second line" },
      { type: "list", ordered: false, start: 1, items: [{ text: "one", children: [] }, { text: "two", children: ["nested"] }] },
      { type: "list", ordered: true, start: 1, items: [{ text: "first", children: [] }] },
      { type: "code", text: "x = 1", lang: null },
    ]);
  });

  it("keeps a code block's language and a numbered list's count across a paragraph", () => {
    const blocks = parseMarkdown("```java\nint x = 1;\n```\n\n1. Subtract 5\n\nNow divide.\n\n2. Divide by 2");
    expect(blocks).toEqual([
      { type: "code", text: "int x = 1;", lang: "java" },
      { type: "list", ordered: true, start: 1, items: [{ text: "Subtract 5", children: [] }] },
      { type: "paragraph", text: "Now divide." },
      { type: "list", ordered: true, start: 2, items: [{ text: "Divide by 2", children: [] }] },
    ]);
  });

  it("parses tables with alignment, padding ragged rows", () => {
    const blocks = parseMarkdown("Compare:\n| Join | Keeps |\n| :--- | :---: |\n| **INNER** | matches only |\n| LEFT | all left rows | extra |\n| RIGHT |\n\nDone.");
    expect(blocks).toEqual([
      { type: "paragraph", text: "Compare:" },
      { type: "table", header: ["Join", "Keeps"], align: ["left", "center"], rows: [["**INNER**", "matches only"], ["LEFT", "all left rows"], ["RIGHT", ""]] },
      { type: "paragraph", text: "Done." },
    ]);
  });

  it("does not take a line with a pipe for a table without a separator row", () => {
    expect(parseMarkdown("P(A | B) is a conditional probability.")).toEqual([{ type: "paragraph", text: "P(A | B) is a conditional probability." }]);
  });

  it("never emits raw html", () => {
    const blocks = parseMarkdown('<script>alert(1)</script> <a href="javascript:x">link</a>');
    expect(blocks).toEqual([{ type: "paragraph", text: '<script>alert(1)</script> <a href="javascript:x">link</a>' }]);
  });
});

describe("renderInline", () => {
  const html = (text: string) => renderToStaticMarkup(createElement(Fragment, null, renderInline(text)));

  it("renders code, bold and italic marks", () => {
    expect(html("Use `x = 1`, **bold** and *italic* or _italic_.")).toBe('Use <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">x = 1</code>, <strong>bold</strong> and <em>italic</em> or <em>italic</em>.');
  });

  it("leaves math alone", () => {
    expect(html("V = l * w * h")).toBe("V = l * w * h");
    expect(html("2*3*4 = 24")).toBe("2*3*4 = 24");
    expect(html("a_1 + a_2 = a_3")).toBe("a_1 + a_2 = a_3");
    expect(html("snake_case_name")).toBe("snake_case_name");
  });
});
