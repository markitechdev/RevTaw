import { describe, expect, it } from "vitest";

import { joinSoftBreaks } from "@/components/materials/material-content";

describe("joinSoftBreaks", () => {
  it("joins mid-sentence line breaks and keeps list items", () => {
    expect(joinSoftBreaks("The address equals base + i\n* size, so access is O(1).\nArrays are static.")).toBe(
      "The address equals base + i * size, so access is O(1).\nArrays are static.",
    );
    expect(joinSoftBreaks("Steps:\n1. Survey\n2. Question")).toBe("Steps:\n1. Survey\n2. Question");
    expect(joinSoftBreaks("- first item\n- second item")).toBe("- first item\n- second item");
    expect(joinSoftBreaks("Shopping:\n* milk\n* eggs")).toBe("Shopping:\n* milk\n* eggs");
  });
});

describe("joinSoftBreaks keeps structure", () => {
  it("keeps code lines and table rows on their own lines", () => {
    const code = "def absolute(x):\n    if x < 0:\n        x = -x\n        print(\"was negative\")\n    return x";
    expect(joinSoftBreaks(code)).toBe(code);
    expect(joinSoftBreaks("Feature | Mitosis | Meiosis\nDivisions | One | Two")).toBe("Feature | Mitosis | Meiosis\nDivisions | One | Two");
    expect(joinSoftBreaks("1. Mitosis\n  • Prophase\n  • Metaphase")).toBe("1. Mitosis\n  • Prophase\n  • Metaphase");
  });
});
