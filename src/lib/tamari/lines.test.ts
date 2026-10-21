import { describe, expect, it } from "vitest";

import { napBubble, tamariLanguage, tamariStatus } from "@/lib/tamari/lines";

describe("tamariLanguage", () => {
  it("speaks the response language, Taglish when the student has not chosen", () => {
    expect(tamariLanguage("auto")).toBe("taglish");
    expect(tamariLanguage("taglish")).toBe("taglish");
    expect(tamariLanguage("fil")).toBe("fil");
    expect(tamariLanguage("en")).toBe("en");
    expect(tamariLanguage("other")).toBe("en");
  });
});

describe("tamariStatus", () => {
  it("says what Tamari is doing in Tamari's language", () => {
    expect(tamariStatus("listening", "taglish")).toBe("Nakikinig ako…");
    expect(tamariStatus("thinking", "fil")).toBe("Iniisip ko…");
    expect(tamariStatus("thinking", "en")).toBe("Thinking…");
  });
});

describe("Tamari's lines from the provider", () => {
  it("asks for a review after a nap, once per session", () => {
    expect(napBubble("taglish")).toMatchObject({ id: "nap", text: "Uy, buhay ka pa pala. Review?" });
    expect(napBubble("en").text).toBe("Oh hey, you're back. Review?");
  });
});
