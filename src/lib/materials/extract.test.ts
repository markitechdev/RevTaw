import { describe, expect, it } from "vitest";

import { htmlToText } from "@/lib/materials/extract";

describe("htmlToText", () => {
  it("keeps headings and list items on their own lines", () => {
    expect(htmlToText("<h1>Cells</h1><p>Basic unit of life.</p><ul><li>Nucleus</li><li>Ribosome</li></ul>")).toBe("Cells\n\nBasic unit of life.\n• Nucleus\n• Ribosome");
  });

  it("decodes entities exactly once", () => {
    // mammoth escapes the student's literal "&lt;" as "&amp;lt;": it must come back as "&lt;", not "<".
    expect(htmlToText("<p>Write &amp;lt;br&amp;gt; for a break &amp; &lt;tags&gt; &quot;quoted&quot; it&#39;s &#x2014; &#8212;</p>")).toBe(
      "Write &lt;br&gt; for a break & <tags> \"quoted\" it's — —",
    );
  });

  it("drops numeric entities that are not characters instead of throwing", () => {
    expect(htmlToText("<p>a&#99999999;b&#x110000;c&#0;d</p>")).toBe("abcd");
  });

  it("leaves unknown named entities alone", () => {
    expect(htmlToText("<p>&copy; 2026 &unknown;</p>")).toBe("&copy; 2026 &unknown;");
  });
});
