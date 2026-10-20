import { describe, expect, it } from "vitest";

import { normalizeQuery, queryTerms, snippetOf } from "@/lib/search/queries";

describe("search helpers", () => {
  it("normalizes the query and keeps the websearch operators", () => {
    expect(normalizeQuery("  binary   tree  ")).toBe("binary tree");
    expect(normalizeQuery('"calvin cycle" -stroma OR atp')).toBe('"calvin cycle" -stroma OR atp');
    expect(normalizeQuery("x".repeat(200))).toHaveLength(120);
  });

  it("extracts the terms used for snippets", () => {
    expect(queryTerms('"Calvin cycle" -stroma OR ATP')).toEqual(["calvin", "cycle", "stroma", "atp"]);
    expect(queryTerms("a")).toEqual([]);
  });

  it("cuts a snippet around the first matching term", () => {
    const text = `${"Intro. ".repeat(40)}The Calvin cycle fixes carbon dioxide into sugar. ${"More. ".repeat(40)}`;
    const snippet = snippetOf(text, ["calvin"]);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet).toContain("Calvin cycle fixes carbon");
    expect(snippet.length).toBeLessThanOrEqual(164);
    expect(snippetOf("short text", ["zzz"])).toBe("short text");
    expect(snippetOf("x".repeat(300), ["zzz"])).toMatch(/…$/);
  });
});
