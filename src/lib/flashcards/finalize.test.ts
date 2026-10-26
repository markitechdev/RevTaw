import { describe, expect, it } from "vitest";

import { finalizeCards, type GeneratedCard } from "@/lib/flashcards/generate";
import { MaterialText } from "@/lib/quizzes/grounding";

const card = (front: string, back: string, source_excerpt = ""): GeneratedCard => ({ front, back, hint: null, concept: "Topic", source_excerpt });

describe("finalizeCards", () => {
  it("keeps cards in any script, and symbol-only fronts", () => {
    const kept = finalizeCards(
      [card("猫", "ねこ: a cat"), card("犬", "いぬ: a dog"), card("光合成とは何ですか？", "植物が光を使って糖を作ること"), card("Клетка", "Основная единица жизни"), card("π", "The ratio of a circle's circumference to its diameter"), card("√", "The square root sign"), card("Σ", "The summation sign")],
      20,
    );
    expect(kept).toHaveLength(7);
  });

  it("keeps one card per fact: the same definition asked four ways is one card", () => {
    const definition = "The process by which green plants convert light energy into chemical energy.";
    const kept = finalizeCards(
      [
        card("Photosynthesis", definition),
        card("What is photosynthesis?", definition),
        card("____ is the process by which green plants convert light energy into chemical energy.", "Photosynthesis"),
        card("Define photosynthesis.", "It is the process by which green plants convert light energy into chemical energy."),
        // Same one-word answer, another fact: a different card.
        card("Which pigment absorbs blue and red light most strongly?", "Chlorophyll"),
        card("Which molecule makes leaves look green?", "Chlorophyll"),
      ],
      20,
    );
    expect(kept.map((item) => item.front)).toEqual(["Photosynthesis", "Which pigment absorbs blue and red light most strongly?", "Which molecule makes leaves look green?"]);
  });

  it("drops a card that can't be studied as one idea", () => {
    const kept = finalizeCards(
      [
        card("Mitosis", "Mitosis is cell division. It has four phases. Prophase comes first. Then metaphase. Then anaphase. Telophase ends it."),
        card("The ____ and the ____ are organelles.", "nucleus, mitochondrion"),
        card("What does chlorophyll, the pigment that absorbs light, do?", "Chlorophyll absorbs light"),
        card("Osmosis", "osmosis"),
        card("Osmosis", "The movement of water across a membrane from low to high solute concentration."),
      ],
      20,
    );
    expect(kept.map((item) => item.front)).toEqual(["Osmosis"]);
    expect(kept[0].back).toMatch(/^The movement of water/);
  });

  it("checks each card's quote against the material", () => {
    const material = new MaterialText(["Photosynthesis is the process by which green plants convert light energy into chemical energy. It takes place in the chloroplast."]);
    const kept = finalizeCards(
      [
        card("Photosynthesis", "Turning light energy into chemical energy.", "Photosynthesis is the process by which green plants convert light energy into chemical energy."),
        card("Where does photosynthesis take place?", "In the chloroplast.", "photosynthesis takes place in the chloroplast"),
        card("Who discovered photosynthesis?", "Jan Ingenhousz", "Jan Ingenhousz discovered photosynthesis in 1779."),
      ],
      20,
      { material },
    );
    expect(kept.map((item) => item.front)).toEqual(["Photosynthesis", "Where does photosynthesis take place?"]);
    // A loose quote is replaced with the material's own words (the two sentences that hold it).
    expect(kept[1].source_excerpt).toBe("Photosynthesis is the process by which green plants convert light energy into chemical energy. It takes place in the chloroplast.");
  });

  it("trims to the requested count", () => {
    expect(finalizeCards([card("A one", "First letter of the alphabet."), card("B two", "Second letter here."), card("C three", "Third letter here.")], 2)).toHaveLength(2);
  });
});
