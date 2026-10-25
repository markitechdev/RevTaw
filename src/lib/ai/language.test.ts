import { describe, expect, it } from "vitest";

import { isClearlyEnglish, languageCounts, replyLanguage } from "@/lib/ai/language";

describe("languageCounts", () => {
  it("counts English and Filipino function words", () => {
    expect(languageCounts("What is the difference between mitosis and meiosis?")).toMatchObject({ english: 4, filipino: 0, words: 8 });
    // "at" is "and" in Filipino and a preposition in English, so it counts for neither.
    expect(languageCounts("Ano ang pagkakaiba ng mitosis at meiosis?")).toMatchObject({ english: 0, filipino: 3 });
    expect(languageCounts("Gets mo na ’to? Di ko pa gets yung LEFT JOIN")).toMatchObject({ english: 0, filipino: 7 });
  });

  it("leaves code out", () => {
    expect(languageCounts("Why does `if (a and b)` fail?\n```python\nif x is None and y:\n    print(x)\n```")).toMatchObject({ english: 2, filipino: 0 });
  });

  it("calls a text clearly English only with two English words and no Filipino one", () => {
    expect(isClearlyEnglish(languageCounts("Where does photosynthesis happen?"))).toBe(true);
    expect(isClearlyEnglish(languageCounts("What is osmosis po?"))).toBe(false);
    expect(isClearlyEnglish(languageCounts("and right?"))).toBe(false);
  });
});

describe("replyLanguage", () => {
  it("states English for a clearly English message", () => {
    expect(replyLanguage("I have my biology exam tomorrow and I'm really nervous.", [])).toBe("en");
    expect(replyLanguage("Where does photosynthesis happen?", ["Ano ang chloroplast?"])).toBe("en");
  });

  it("states nothing when the message has a Filipino word (Filipino, Taglish, Cebuano)", () => {
    expect(replyLanguage("Ano ang osmosis?", [])).toBeNull();
    expect(replyLanguage("Explain mo nga yung LEFT JOIN, di ko gets", [])).toBeNull();
    expect(replyLanguage("What is osmosis po?", [])).toBeNull();
    expect(replyLanguage("Unsa ang osmosis?", [])).toBeNull();
  });

  it("goes by the student's latest messages when this one is too short to tell", () => {
    expect(replyLanguage("and right?", ["What does a LEFT JOIN do in SQL?"])).toBe("en");
    expect(replyLanguage("and right?", ["What does a LEFT JOIN do in SQL?", "Ano naman yung INNER JOIN?"])).toBeNull();
    expect(replyLanguage(null, ["What is glycolysis?"])).toBe("en");
    expect(replyLanguage(null, [])).toBeNull();
  });

  it("takes a short greeting as English, but not a longer text in another language", () => {
    expect(replyLanguage("Hi Tamari!", [])).toBe("en");
    expect(replyLanguage("2x + 5 = 13", [])).toBeNull();
    expect(replyLanguage("Il y a un problème avec la question", [])).toBeNull();
  });
});
