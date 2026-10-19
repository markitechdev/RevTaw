import { describe, expect, it } from "vitest";

import { parseMarkdown } from "@/components/content/markdown";

describe("parseMarkdown", () => {
  it("parses paragraphs, headings, lists and code fences", () => {
    const blocks = parseMarkdown("## Topic\nFirst line\nsecond line\n\n- one\n- two\n  - nested\n1. first\n\n```\nx = 1\n```");
    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "Topic" },
      { type: "paragraph", text: "First line second line" },
      { type: "list", ordered: false, items: [{ text: "one", children: [] }, { text: "two", children: ["nested"] }] },
      { type: "list", ordered: true, items: [{ text: "first", children: [] }] },
      { type: "code", text: "x = 1" },
    ]);
  });

  it("never emits raw html", () => {
    const blocks = parseMarkdown('<script>alert(1)</script> <a href="javascript:x">link</a>');
    expect(blocks).toEqual([{ type: "paragraph", text: '<script>alert(1)</script> <a href="javascript:x">link</a>' }]);
  });
});
