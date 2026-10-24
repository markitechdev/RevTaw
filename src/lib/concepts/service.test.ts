import { describe, expect, it } from "vitest";

import { normalizeConceptName } from "@/lib/concepts/service";

describe("normalizeConceptName", () => {
  it("keeps C, C++ and C# apart", () => {
    const keys = ["C", "C++", "C#", "c sharp", "F#"].map(normalizeConceptName);
    expect(keys).toEqual(["c", "c plus plu", "c sharp", "c sharp", "f sharp"]);
    expect(new Set(keys.slice(0, 3)).size).toBe(3);
  });

  it("still joins case, accents, punctuation and plurals", () => {
    expect(normalizeConceptName("Linked Lists")).toBe(normalizeConceptName("linked list"));
    expect(normalizeConceptName("Café-au-lait")).toBe("cafe au lait");
    expect(normalizeConceptName("  Mitosis:  phases ")).toBe("mitosis phase");
  });
});
