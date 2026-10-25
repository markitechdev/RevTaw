import { describe, expect, it } from "vitest";

import { asksAboutNotes, excerpt, labelChunk, retrievalQuery, searchableQuestion, selectContext, sharesTopic, tokenize, topicWords, type ContextChunk } from "@/lib/tutor/context";

const chunks: ContextChunk[] = [
  { id: "a", position: 0, heading: "Photosynthesis Overview", pageStart: 1, pageEnd: 1, content: "Photosynthesis is the process by which green plants convert light energy into chemical energy. The overall equation is 6CO2 + 6H2O -> C6H12O6 + 6O2." },
  { id: "b", position: 1, heading: "Light-Dependent Reactions", pageStart: 2, pageEnd: 2, content: "These reactions occur in the thylakoid membranes and produce ATP and NADPH. Chlorophyll is a pigment that absorbs light most strongly in the blue and red wavelengths." },
  { id: "c", position: 2, heading: "Calvin Cycle", pageStart: 3, pageEnd: 4, content: "The Calvin cycle is the set of reactions that fixes carbon dioxide into sugar using ATP and NADPH. It takes place in the stroma of the chloroplast." },
];

describe("tutor context", () => {
  it("tokenizes without stopwords", () => {
    expect(tokenize("What does the Calvin cycle do?")).toEqual(["calvin", "cycle"]);
  });

  it("ranks the chunk that answers the question first within a tight budget", () => {
    const picked = selectContext(chunks, "Where does the Calvin cycle take place?", null, 160);
    expect(picked.chunks.map((chunk) => chunk.id)).toEqual(["c"]);
    expect(picked.truncated).toBe(true);
  });

  it("always includes the chunk holding the highlighted text", () => {
    const picked = selectContext(chunks, "Explain this.", "Chlorophyll is a pigment", 180);
    expect(picked.chunks[0].id).toBe("b");
  });

  it("sends a short material whole in reading order", () => {
    const picked = selectContext(chunks, "summarize everything", null);
    expect(picked.chunks.map((chunk) => chunk.id)).toEqual(["a", "b", "c"]);
    expect(picked.truncated).toBe(false);
  });

  it("follows the hybrid search ranking when there is one", () => {
    // "Saan nangyayari?" shares no English words with chunk c, but search ranked it first.
    const picked = selectContext(chunks, "Saan nangyayari ang Calvin?", null, 160, ["c", "a"]);
    expect(picked.chunks.map((chunk) => chunk.id)).toEqual(["c"]);
    const unknownIds = selectContext(chunks, "Where does the Calvin cycle take place?", null, 160, ["zzz"]);
    expect(unknownIds.chunks.map((chunk) => chunk.id)).toEqual(["c"]);
  });

  it("falls back to keyword scoring when search found nothing", () => {
    const picked = selectContext(chunks, "Where does the Calvin cycle take place?", null, 160, []);
    expect(picked.chunks.map((chunk) => chunk.id)).toEqual(["c"]);
  });

  it("labels sections with headings and page ranges", () => {
    expect(labelChunk(chunks[2])).toBe("[Section 2: Calvin Cycle, pages 3-4]");
    expect(labelChunk({ ...chunks[0], heading: null, pageStart: null, pageEnd: null })).toBe("[Section 0]");
  });
});

describe("retrievalQuery", () => {
  it("searches with the topic of the answer a follow-up is about", () => {
    expect(retrievalQuery("Give me an example.", { question: "What is a LEFT JOIN?", answer: "A LEFT JOIN keeps every row of the left table." }, null)).toBe(
      "Give me an example. What is a LEFT JOIN? A LEFT JOIN keeps every row of the left table.",
    );
  });

  it("adds the previous question to a short follow-up, and leaves a full question alone", () => {
    expect(retrievalQuery("Why does that happen?", null, "What is glycolysis?")).toBe("Why does that happen? What is glycolysis?");
    const full = "Explain how the electron transport chain produces most of the ATP in cellular respiration.";
    expect(retrievalQuery(full, null, "What is glycolysis?")).toBe(full);
  });
});

describe("passages from all of the student's materials", () => {
  it("labels a passage by its number and material", () => {
    const passage = { id: "x", position: 7, heading: "Osmosis", pageStart: 3, pageEnd: 4, content: "…", materialId: "m1", materialTitle: 'Bio "Unit 2"', ref: 2 };
    expect(labelChunk(passage)).toBe("[Passage 2 — \"Bio 'Unit 2'\", Osmosis, pages 3-4]");
    expect(labelChunk({ ...passage, ref: undefined })).toBe("[Section 7: Osmosis, pages 3-4]");
  });

  it("cuts a long passage to the paragraphs about the question", () => {
    const filler = (word: string, times = 120) => `${word} `.repeat(times).trim();
    const text = [filler("intro"), filler("history"), `Osmosis moves water across a membrane. ${filler("osmosis", 100)}`, filler("summary")].join("\n\n");
    const cut = excerpt(text, "Ano ang ibig sabihin ng osmosis?", 1_000);
    expect(cut.length).toBeLessThanOrEqual(1_000);
    expect(cut).toMatch(/^… Osmosis moves water across a membrane\. osmosis/);
    expect(cut.endsWith("osmosis …")).toBe(true);
    expect(excerpt("Short passage.", "anything", 1_000)).toBe("Short passage.");
    // Nothing matches: the start.
    const start = excerpt(text, "photosynthesis", 800);
    expect(start).toMatch(/^intro intro/);
    expect(start.length).toBeLessThanOrEqual(800);
    // One very long paragraph: a window around the first match.
    const long = `${"a ".repeat(2_000)}mitochondria are the powerhouse ${"b ".repeat(2_000)}`;
    const window = excerpt(long, "mitochondria", 600);
    expect(window).toMatch(/^….*mitochondria are the powerhouse.*…$/);
    expect(window.length).toBeLessThanOrEqual(600);
  });

  it("checks that a passage shares the question's topic", () => {
    const about = (question: string, passage: string) => sharesTopic(topicWords(question), passage);
    expect(about("Ano ang ibig sabihin ng osmosis?", "Osmosis is the movement of water across a membrane.")).toBe(true);
    expect(about("How do plants make their own food?", "Plants convert light energy into glucose.")).toBe(true);
    // Asking words and Filipino function words don't count: the passage needs the topic itself.
    expect(about("Explain the meaning of inflation, please", "Explain the meaning of each term in this chapter.")).toBe(false);
    expect(about("Ano ang inflation?", "Ang mga halaman ay gumagawa ng pagkain.")).toBe(false);
    expect(about("Thanks!", "Thanks for reading.")).toBe(false);
    // A word that can be a topic stays one: the mean in statistics.
    expect(about("What is the mean?", "The mean is the sum of the values divided by their count.")).toBe(true);
  });

  it("knows when the student asks about their own materials", () => {
    for (const message of [
      "What do my notes say about osmosis?",
      "Summarize my Biology reviewer",
      "Ano ang sabi sa notes ko tungkol sa osmosis?",
      "According to the module, what is GDP?",
      "Yung inupload ko, ano ang main idea?",
      "In the PDF I uploaded, what is a cell?",
    ])
      expect(asksAboutNotes(message), message).toBe(true);
    for (const message of ["What is osmosis?", "What is a file system?", "Check my answer", "Ano ang photosynthesis?"]) expect(asksAboutNotes(message), message).toBe(false);
  });

  it("doesn't search for greetings and thanks", () => {
    for (const message of ["hi", "Hello Tamari!", "Salamat po", "thanks!", "ok", "Good morning", "hahaha"]) expect(searchableQuestion(message), message).toBe(false);
    for (const message of ["What is osmosis?", "Ano ang photosynthesis?", "Explain recursion", "quiz me on my notes"]) expect(searchableQuestion(message), message).toBe(true);
  });
});
