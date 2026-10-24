import { describe, expect, it } from "vitest";

import { clampText, clampTitle, TITLE_MAX, titleWithSuffix } from "@/lib/text/clamp";

const longTitle = "Photosynthesis and cellular respiration ".repeat(4).trim(); // 159 characters

describe("clampTitle", () => {
  it("keeps titles that fit and cuts the rest with an ellipsis", () => {
    expect(clampTitle("Short title")).toBe("Short title");
    const cut = clampTitle(`${longTitle} and more`);
    expect(Array.from(cut)).toHaveLength(TITLE_MAX);
    expect(cut.endsWith("…")).toBe(true);
  });

  it("never leaves a title empty and collapses spaces", () => {
    expect(clampTitle("   ")).toBe("Untitled");
    expect(clampTitle("Bio\n\n  notes")).toBe("Bio notes");
  });

  it("counts characters as Postgres does and never splits an emoji", () => {
    const emoji = "📚".repeat(200);
    const cut = clampText(emoji, 160);
    expect(Array.from(cut)).toHaveLength(160);
    expect(cut).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe("titleWithSuffix", () => {
  it("shortens the name and keeps the suffix", () => {
    const title = titleWithSuffix(longTitle, "Flashcards");
    expect(Array.from(title).length).toBeLessThanOrEqual(TITLE_MAX);
    expect(title.endsWith(" — Flashcards")).toBe(true);
    expect(titleWithSuffix("Cell biology", "Quiz")).toBe("Cell biology — Quiz");
  });
});
