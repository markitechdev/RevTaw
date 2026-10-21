import { describe, expect, it } from "vitest";

import { listeningLanguage, looksFilipino, speakableText, speakingLanguage, speechChunks } from "@/lib/voice/speech-text";

describe("speakableText", () => {
  it("reads markdown as plain sentences", () => {
    const text = speakableText("## Photosynthesis\n\n**Chlorophyll** absorbs *light*.\n\n- Light reactions\n- Calvin cycle\n\nSee [the source](https://example.com).");
    expect(text).toBe("Photosynthesis. Chlorophyll absorbs light. Light reactions. Calvin cycle. See the source.");
  });

  it("skips code and tables' rules, keeps cells", () => {
    expect(speakableText("Run this:\n```js\nconsole.log(1)\n```\n| A | B |\n|---|---|\n| 1 | 2 |")).toBe("Run this: The code is on screen. A, B. 1, 2.");
  });

  it("cuts long answers at a sentence and points to the screen", () => {
    const long = Array.from({ length: 80 }, (_, index) => `Sentence number ${index} is here.`).join(" ");
    const text = speakableText(long);
    expect(text.length).toBeLessThan(1500);
    expect(text.endsWith("The rest is on screen.")).toBe(true);
  });
});

describe("speechChunks", () => {
  it("splits on sentences under the size", () => {
    const chunks = speechChunks("One. Two two. Three three three.", 12);
    expect(chunks).toEqual(["One.", "Two two.", "Three three", "three."].filter((chunk) => chunk.length <= 12 || chunk));
    expect(chunks.every((chunk) => chunk.length <= 12)).toBe(true);
  });
});

describe("languages", () => {
  it("detects Filipino and Taglish text", () => {
    expect(looksFilipino("Ang chlorophyll ay isang pigment na sumisipsip ng liwanag.")).toBe(true);
    expect(looksFilipino("Sa photosynthesis, ginagawang chemical energy ng halaman ang sunlight.")).toBe(true);
    expect(looksFilipino("Chlorophyll absorbs light in the blue and red wavelengths.")).toBe(false);
  });

  it("listens and speaks in the response language", () => {
    expect(listeningLanguage("en", "fil-PH")).toBe("en-US");
    expect(listeningLanguage("taglish", "en-US")).toBe("fil-PH");
    expect(listeningLanguage("auto", "tl-PH")).toBe("fil-PH");
    expect(listeningLanguage("auto", "en-GB")).toBe("en-GB");
    expect(speakingLanguage("auto", "Ang sagot ay mali dahil hindi ito ang tamang pigment.", "en-US")).toBe("fil-PH");
    expect(speakingLanguage("auto", "The answer is wrong because it is not the right pigment.", "fil-PH")).toBe("en-US");
    expect(speakingLanguage("fil", "Hello", "en-US")).toBe("fil-PH");
  });
});
