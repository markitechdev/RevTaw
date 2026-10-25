import { describe, expect, it } from "vitest";

import type { ContextChunk } from "./context";
import { finalizeReply, quoteInPassage, type DraftReply } from "./reply";
import { groundingLabel } from "./types";

const chunk: ContextChunk = { id: "c1", position: 1, heading: "Light reactions", pageStart: 2, pageEnd: 3, content: "Chlorophyll is a pigment that absorbs light most strongly in the blue and red wavelengths." };
const draft = (overrides: Partial<DraftReply>): DraftReply => ({
  answer: "Chlorophyll absorbs blue and red light.",
  grounding: "material",
  sources: [{ position: 1, heading: null, pages: null, quote: "Chlorophyll is a pigment" }],
  additional_explanation: null,
  follow_ups: ["example"],
  flashcard: { front: "Chlorophyll absorbs?", back: "Blue and red light" },
  ...overrides,
});

describe("finalizeReply", () => {
  it("stores small talk with no label, sources, follow-ups or flashcard", () => {
    const final = finalizeReply(draft({ answer: "Hi Mark! What are we studying today?", grounding: "conversation", additional_explanation: "extra" }), [chunk], true);
    expect(final).toMatchObject({ grounding: null, sources: [], follow_ups: [], flashcard: null, additional_explanation: null });
  });

  it("never claims a material in a chat without one, and folds general knowledge into the answer", () => {
    const final = finalizeReply(draft({ grounding: "partial", sources: [], additional_explanation: "Plants look green because they reflect green light." }), [], false);
    expect(final.grounding).toBe("general");
    expect(final.additional_explanation).toBeNull();
    expect(final.answer).toBe("Chlorophyll absorbs blue and red light.\n\nPlants look green because they reflect green light.");
    expect(finalizeReply(draft({ grounding: "general", sources: [], additional_explanation: "Chlorophyll absorbs blue and red light." }), [], false).answer).toBe("Chlorophyll absorbs blue and red light.");
  });

  it("keeps a material answer's sources that point at sent passages, with their heading and pages", () => {
    const final = finalizeReply(draft({ sources: [{ position: 1, heading: null, pages: null, quote: "Chlorophyll is a pigment" }, { position: 9, heading: "Elsewhere", pages: null, quote: "made up" }] }), [chunk], true);
    expect(final.grounding).toBe("material");
    expect(final.sources).toEqual([{ position: 1, heading: "Light reactions", pages: "2-3", quote: "Chlorophyll is a pigment" }]);
  });
});

describe("groundingLabel", () => {
  it("labels by source, plainly without a material, and not at all for small talk", () => {
    expect(groundingLabel("material", true)).toBe("Based on your material");
    expect(groundingLabel("general", true)).toBe("General knowledge (not from your material)");
    expect(groundingLabel("general", false)).toBe("General knowledge");
    expect(groundingLabel(null, true)).toBeNull();
  });
});

describe("quotes from the material", () => {
  const passage = "Chlorophyll is a pigment that absorbs light most strongly in the blue and red wavelengths.";

  it("accepts an exact, trimmed or re-punctuated quote", () => {
    expect(quoteInPassage("Chlorophyll is a pigment that absorbs light", passage)).toBe(true);
    expect(quoteInPassage("“absorbs light most strongly in the BLUE and red”", passage)).toBe(true);
    expect(quoteInPassage("Chlorophyll is a pigment", passage)).toBe(true);
  });

  it("rejects an invented or paraphrased quote", () => {
    expect(quoteInPassage("Chlorophyll reflects green light so leaves look green", passage)).toBe(false);
    expect(quoteInPassage("a pigment absorbing mostly blue and red light", passage)).toBe(false);
    expect(quoteInPassage("", passage)).toBe(false);
    expect(quoteInPassage("pigment", passage)).toBe(false);
  });

  it("drops invented quotes and stops calling an unquoted answer material-based", () => {
    const invented = finalizeReply(draft({ sources: [{ position: 1, heading: null, pages: null, quote: "Chlorophyll was discovered in 1817 by Pelletier." }] }), [chunk], true);
    expect(invented.sources).toEqual([]);
    expect(invented.grounding).toBe("general");
    expect(finalizeReply(draft({ grounding: "partial", sources: [] }), [chunk], true).grounding).toBe("general");
    expect(finalizeReply(draft({ grounding: "not_found", sources: [] }), [chunk], true).grounding).toBe("not_found");
  });
});
