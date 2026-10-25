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

  it("states English when the student's message is in English, for the Auto setting only", () => {
    const rules = responseStyleRules(DEFAULT_AI, "en").join("\n");
    expect(rules).toMatch(/message is in English, so reply in English/);
    expect(rules).not.toMatch(/language the student writes in/);
    expect(responseStyleRules({ ...DEFAULT_AI, language: "taglish" }, "en").join(" ")).toMatch(/natural Taglish/);
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
