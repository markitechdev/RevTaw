import { describe, expect, it } from "vitest";

import { formatScripts, hasReadableText, htmlToText, pageList, scriptText } from "@/lib/materials/extract";
import { SCRIPT_MARK } from "@/lib/materials/extract-sandbox";

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

describe("superscripts and subscripts", () => {
  it("writes them so they can't be misread", () => {
    expect(scriptText("sup", "23")).toBe("²³");
    expect(scriptText("sup", "-3")).toBe("⁻³");
    expect(scriptText("sup", "n+1")).toBe("ⁿ⁺¹");
    expect(scriptText("sup", "2x")).toBe("^(2x)");
    expect(scriptText("sup", "a")).toBe("^a");
    expect(scriptText("sup", "st")).toBe("st");
    expect(scriptText("sup", "[1]")).toBe("[1]");
    expect(scriptText("sub", "2")).toBe("₂");
    expect(scriptText("sub", "max")).toBe("ₘₐₓ");
    expect(scriptText("sub", "eq")).toBe("_eq");
    expect(scriptText("sub", "")).toBe("");
  });

  it("reads Word's superscripts and subscripts, and marks nested ones innermost first", () => {
    expect(htmlToText("<p>6.02 × 10<sup>23</sup> per mole; H<sub>2</sub>O; x<sup><em>n</em></sup>; the 1<sup>st</sup> law</p>")).toBe("6.02 × 10²³ per mole; H₂O; xⁿ; the 1st law");
    const { supOpen, supClose } = SCRIPT_MARK;
    expect(formatScripts(`e${supOpen}x${supOpen}2${supClose}${supClose}`)).toBe("e^(x²)");
    // A mark cut off at the end of the text is dropped.
    expect(formatScripts(`10${supOpen}23`)).toBe("1023");
  });
});

describe("unreadable PDF pages", () => {
  it("counts a page with only its page number as unreadable", () => {
    for (const text of ["", "12", "Page 3", "- 4 -", "5 of 20", "Pahina 6"]) expect(hasReadableText(text)).toBe(false);
    for (const text of ["Chapter 1 Cells", "Cells\n7", "Ang Selula"]) expect(hasReadableText(text)).toBe(true);
  });

  it("lists pages as short ranges", () => {
    expect(pageList([2])).toBe("2");
    expect(pageList([2, 3])).toBe("2–3");
    expect(pageList([2, 5, 6, 7, 9])).toBe("2, 5–7 and 9");
  });
});
