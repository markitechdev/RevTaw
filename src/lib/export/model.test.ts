import { describe, expect, it } from "vitest";

import { renderHtml } from "@/lib/export/html";
import { fileSlug, inlineRuns, markdownBlocks, type ExportDocument } from "@/lib/export/model";

describe("export model", () => {
  it("splits inline marks into runs", () => {
    expect(inlineRuns("Plain **bold** and _italic_ with `code`")).toEqual([
      { text: "Plain " },
      { text: "bold", bold: true },
      { text: " and " },
      { text: "italic", italic: true },
      { text: " with " },
      { text: "code", code: true },
    ]);
    expect(inlineRuns("**")).toEqual([{ text: "**" }]);
  });

  it("turns reviewer markdown into headings, lists and paragraphs", () => {
    const blocks = markdownBlocks("## Key terms\n- Osmosis: water moves\n  - across a membrane\n1. First\n2. Second\n\nA paragraph with **bold**.");
    expect(blocks.map((block) => block.type)).toEqual(["heading", "list", "list", "paragraph"]);
    expect(blocks[1]).toMatchObject({ type: "list", ordered: false, items: [{ runs: [{ text: "Osmosis: water moves" }], children: [[{ text: "across a membrane" }]] }] });
    expect(blocks[2]).toMatchObject({ type: "list", ordered: true });
  });

  it("makes safe file names", () => {
    expect(fileSlug("Photosynthesis — Mixed Quiz: results")).toBe("Photosynthesis-Mixed-Quiz-results");
    expect(fileSlug("   ")).toBe("export");
    expect(fileSlug("Ñandú & co")).toBe("Nandu-co");
  });

  it("renders a printable page with everything escaped and the script nonced", () => {
    const document: ExportDocument = {
      title: "Quiz <script>alert(1)</script>",
      subtitle: null,
      meta: ["10 questions"],
      sections: [{ heading: "Questions", blocks: [{ type: "paragraph", runs: [{ text: "1 < 2 & 3 > 2", bold: true }] }, { type: "table", columns: ["A"], rows: [["<b>"]] }] }],
      footer: "Exported",
    };
    const html = renderHtml(document, { print: true, nonce: "abc" });
    expect(html).toContain("Quiz &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("<strong>1 &lt; 2 &amp; 3 &gt; 2</strong>");
    expect(html).toContain("<td>&lt;b&gt;</td>");
    expect(html).toContain('<script nonce="abc">');
    expect(html).toContain("window.print()");
    expect(html).not.toContain("onclick=");
  });
});
