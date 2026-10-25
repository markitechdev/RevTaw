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
    const final = finalizeReply(draft({ answer: "Hi Mark! What are we studying today?", grounding: "conversation", additional_explanation: "extra" }), [chunk], "material");
    expect(final).toMatchObject({ grounding: null, sources: [], follow_ups: [], flashcard: null, additional_explanation: null });
  });

  it("never claims a material in a chat without one, and folds general knowledge into the answer", () => {
    const final = finalizeReply(draft({ grounding: "partial", sources: [], additional_explanation: "Plants look green because they reflect green light." }), [], "none");
    expect(final.grounding).toBe("general");
    expect(final.additional_explanation).toBeNull();
    expect(final.answer).toBe("Chlorophyll absorbs blue and red light.\n\nPlants look green because they reflect green light.");
    expect(finalizeReply(draft({ grounding: "general", sources: [], additional_explanation: "Chlorophyll absorbs blue and red light." }), [], "none").answer).toBe("Chlorophyll absorbs blue and red light.");
  });

  it("keeps a material answer's sources that point at sent passages, with their heading and pages", () => {
    const final = finalizeReply(draft({ sources: [{ position: 1, heading: null, pages: null, quote: "Chlorophyll is a pigment" }, { position: 9, heading: "Elsewhere", pages: null, quote: "made up" }] }), [chunk], "material");
    expect(final.grounding).toBe("material");
    expect(final.sources).toEqual([{ position: 1, heading: "Light reactions", pages: "2-3", quote: "Chlorophyll is a pigment" }]);
  });
});

describe("finalizeReply across all of the student's materials", () => {
  // Two materials whose passages share a position: each is cited by its passage number.
  const bio: ContextChunk = { ...chunk, id: "b4", position: 4, materialId: "m-bio", materialTitle: "Biology Notes", ref: 1 };
  const chem: ContextChunk = { id: "c4", position: 4, heading: "Bonds", pageStart: null, pageEnd: null, content: "A covalent bond shares a pair of electrons between two atoms.", materialId: "m-chem", materialTitle: "Chemistry Reviewer", ref: 2 };

  it("finds each source by its passage number and keeps its material", () => {
    const final = finalizeReply(
      draft({ grounding: "partial", sources: [{ position: 2, heading: null, pages: null, quote: "A covalent bond shares a pair of electrons" }], additional_explanation: "Ionic bonds transfer electrons instead." }),
      [bio, chem],
      "notes",
    );
    expect(final.grounding).toBe("partial");
    expect(final.sources).toEqual([{ position: 4, heading: "Bonds", pages: null, quote: "A covalent bond shares a pair of electrons", materialId: "m-chem", materialTitle: "Chemistry Reviewer" }]);
    expect(final.additional_explanation).toBe("Ionic bonds transfer electrons instead.");
  });

  it("treats an answer that didn't use the passages as general knowledge, all in one piece", () => {
    const final = finalizeReply(draft({ grounding: "general", sources: [], additional_explanation: "More about it." }), [bio, chem], "notes");
    expect(final).toMatchObject({ grounding: "general", sources: [], additional_explanation: null });
    expect(final.answer).toMatch(/More about it\.$/);
    // A position that only exists inside one material isn't a passage number here.
    expect(finalizeReply(draft({ sources: [{ position: 4, heading: null, pages: null, quote: "Chlorophyll is a pigment" }] }), [bio, chem], "notes").sources).toEqual([]);
    expect(finalizeReply(draft({ grounding: "not_found", sources: [] }), [bio, chem], "notes").grounding).toBe("not_found");
    expect(finalizeReply(draft({ grounding: "material", sources: [] }), [], "notes").grounding).toBe("general");
  });

  it("says “not found” when the student asked about their notes and the search found nothing, whatever the reply claims", () => {
    const asked = { askedAboutNotes: true };
    expect(finalizeReply(draft({ grounding: "general", sources: [] }), [], "notes", asked).grounding).toBe("not_found");
    expect(finalizeReply(draft({ grounding: "material", sources: [{ position: 1, heading: null, pages: null, quote: "Chlorophyll is a pigment" }] }), [], "notes", asked)).toMatchObject({ grounding: "not_found", sources: [] });
    // A question that isn't about their notes stays general knowledge, and small talk keeps no label.
    expect(finalizeReply(draft({ grounding: "not_found", sources: [] }), [], "notes").grounding).toBe("general");
    expect(finalizeReply(draft({ grounding: "conversation", sources: [] }), [], "notes", asked).grounding).toBeNull();
    // With passages, the reply's own label stands (checked against its quotes as always).
    expect(finalizeReply(draft({ grounding: "general", sources: [] }), [bio, chem], "notes", asked).grounding).toBe("general");
  });
});

describe("groundingLabel", () => {
  it("labels by source, in a chat without a material by the student's notes, and not at all for small talk", () => {
    expect(groundingLabel("material", true)).toBe("Based on your material");
    expect(groundingLabel("general", true)).toBe("General knowledge (not from your material)");
    expect(groundingLabel("general", false)).toBe("General knowledge");
    expect(groundingLabel("material", false)).toBe("Based on your notes");
    expect(groundingLabel("partial", false)).toBe("Based on your notes + general knowledge");
    expect(groundingLabel("not_found", false)).toBe("Not found in your notes");
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
    const invented = finalizeReply(draft({ sources: [{ position: 1, heading: null, pages: null, quote: "Chlorophyll was discovered in 1817 by Pelletier." }] }), [chunk], "material");
    expect(invented.sources).toEqual([]);
    expect(invented.grounding).toBe("general");
    expect(finalizeReply(draft({ grounding: "partial", sources: [] }), [chunk], "material").grounding).toBe("general");
    expect(finalizeReply(draft({ grounding: "not_found", sources: [] }), [chunk], "material").grounding).toBe("not_found");
  });
});
