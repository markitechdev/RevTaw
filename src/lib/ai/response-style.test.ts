import { describe, expect, it } from "vitest";

import { responseStyleRules } from "@/lib/ai/response-style";
import { DEFAULT_AI } from "@/lib/preferences/schema";

describe("responseStyleRules", () => {
  it("adds nothing without preferences", () => {
    expect(responseStyleRules(undefined)).toEqual([]);
  });

  it("follows the student's language by default and lets a direct request win", () => {
    const rules = responseStyleRules(DEFAULT_AI).join("\n");
    expect(rules).toMatch(/language the student writes in/);
    expect(rules).toMatch(/asks for a particular language/);
  });

  it("names Taglish, Filipino and a custom language", () => {
    expect(responseStyleRules({ ...DEFAULT_AI, language: "taglish" }).join(" ")).toMatch(/Taglish/);
    expect(responseStyleRules({ ...DEFAULT_AI, language: "fil" }).join(" ")).toMatch(/Filipino \(Tagalog\)/);
    expect(responseStyleRules({ ...DEFAULT_AI, language: "other", otherLanguage: "Cebuano" }).join(" ")).toMatch(/reply in Cebuano/);
  });

  it("maps style and depth", () => {
    const rules = responseStyleRules({ ...DEFAULT_AI, style: "concise", depth: "deep" }).join(" ");
    expect(rules).toMatch(/short and direct/);
    expect(rules).toMatch(/full reasoning/);
  });
});
