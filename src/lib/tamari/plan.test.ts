import { describe, expect, it } from "vitest";

import { allocateMinutes, planDoneLine, planReaction, planTamariBlocks, timesInFilipino, type TamariPlanInput } from "@/lib/tamari/plan";

const base: TamariPlanInput = {
  minutes: 20,
  lang: "taglish",
  material: { id: "m1", title: "Data Structures" },
  exam: null,
  overdue: ["Stacks", "Queues"],
  weak: ["Binary Trees", "Recursion"],
  misconception: null,
  repeated: { name: "Binary Trees", count: 3 },
  openMistakes: 4,
  dueCards: 6,
};

const shape = (input: TamariPlanInput) => planTamariBlocks(input).blocks.map((block) => `${block.key}:${block.minutes}`);

describe("allocateMinutes", () => {
  it("gives every block its minimum and splits the rest by share, adding up exactly", () => {
    const slots = [
      { share: 0.15, min: 2 },
      { share: 0.35, min: 3 },
      { share: 0.25, min: 3 },
      { share: 0.15, min: 2 },
      { share: 0.1, min: 2 },
    ];
    expect(allocateMinutes(20, slots)).toEqual([3, 7, 5, 3, 2]);
    for (const total of [12, 17, 25, 33, 60]) expect(allocateMinutes(total, slots).reduce((sum, value) => sum + value, 0)).toBe(total);
  });
});

describe("planTamariBlocks", () => {
  it("turns 20 minutes into the doc's Bitaw: recall, weak-topic quiz, Feynman, mistakes, retest", () => {
    const draft = planTamariBlocks(base);
    expect(draft.title).toBe("Tamari's 20-Minute Bitaw");
    expect(shape(base)).toEqual(["recall:3", "quiz:7", "feynman:5", "mistakes:3", "retest:2"]);
    expect(draft.blocks.map((block) => block.label)).toEqual(["Active Recall", "Weak Topic Quiz", "Feynman", "Mistake Review", "Retest"]);
    const [recall, quiz, feynman] = draft.blocks;
    expect(recall).toMatchObject({ method: "active_recall", concepts: ["Stacks", "Queues"] });
    expect(recall.reason).toBe("Stacks and Queues — malapit nang makalimutan. Balikan muna natin.");
    expect(quiz).toMatchObject({ method: "practice_testing", focus: "Binary Trees, Recursion", questionCount: 8 });
    expect(feynman.reason).toBe("Tatlong beses na nating namiss ang Binary Trees. Tara, explain mo sakin.");
    // The same count, and the same scope, as the notebook the Error Review block retests.
    expect(draft.blocks[3].reason).toBe("4 mali mula sa Data Structures sa notebook mo. Balikan natin para hindi na maulit.");
    expect(planTamariBlocks({ ...base, lang: "en" }).blocks[3].reason).toBe("4 open mistakes from Data Structures in your notebook. Let's make sure they don't come back.");
    expect(draft.intro).toBe("Ako na bahala. 20 minutes, 5 blocks sa Data Structures.");
  });

  it("keeps short plans to three blocks and always adds up to the minutes", () => {
    expect(shape({ ...base, minutes: 10 })).toEqual(["recall:2", "quiz:6", "mistakes:2"]);
    expect(shape({ ...base, minutes: 10, openMistakes: 0 })).toEqual(["recall:2", "quiz:6", "retest:2"]);
    expect(shape({ ...base, minutes: 5 })).toEqual(["recall:2", "quiz:3"]);
    for (const minutes of [5, 10, 15, 20, 30, 45, 60, 90]) {
      const blocks = planTamariBlocks({ ...base, minutes }).blocks;
      expect(blocks.reduce((sum, block) => sum + block.minutes, 0)).toBe(minutes);
      expect(new Set(blocks.map((block) => block.key)).size).toBe(blocks.length);
    }
  });

  it("opens long plans with a blurt and fits in due cards", () => {
    const keys = planTamariBlocks({ ...base, minutes: 60 }).blocks.map((block) => block.key);
    expect(keys[0]).toBe("blurt");
    expect(keys).toContain("cards");
    expect(keys[keys.length - 1]).toBe("retest");
  });

  it("names the exam and speaks the student's language", () => {
    const draft = planTamariBlocks({ ...base, lang: "en", exam: { title: "Calculus", daysLeft: 3 } });
    expect(draft.intro).toBe("Leave it to me. 20 minutes, 5 blocks — for your Calculus exam in 3 days.");
    expect(draft.blocks[0].reason).toBe("Stacks and Queues are fading. A quick recall before they slip.");
    expect(planTamariBlocks({ ...base, exam: { title: "Calculus", daysLeft: 1 } }).intro).toBe("Ako na bahala. 20 minutes, 5 blocks — para sa Calculus exam mo bukas.");
  });

  it("warms up on weak concepts when nothing is fading, and explains a misconception first", () => {
    const draft = planTamariBlocks({ ...base, overdue: [], misconception: "Heaps", repeated: null });
    expect(draft.blocks[0]).toMatchObject({ concepts: ["Binary Trees", "Recursion"] });
    expect(draft.blocks.find((block) => block.key === "feynman")).toMatchObject({ concepts: ["Heaps"] });
  });

  it("calls it a plain quiz when the top concepts aren't weak topics", () => {
    const quiz = planTamariBlocks({ ...base, lang: "en", weakTopics: [] }).blocks.find((block) => block.key === "quiz");
    expect(quiz).toMatchObject({ label: "Quiz", reason: "A quiz on Binary Trees and Recursion: what's next to practice." });
  });

  it("calls only the weak topics weak, and the rest what's next to practice", () => {
    const quiz = (input: TamariPlanInput) => planTamariBlocks(input).blocks.find((block) => block.key === "quiz");
    expect(quiz({ ...base, lang: "en", weakTopics: ["Recursion"] })).toMatchObject({ label: "Weak Topic Quiz", focus: "Binary Trees, Recursion", reason: "A quiz on your weak topic: Recursion, plus what's next to practice: Binary Trees." });
    expect(quiz({ ...base, weakTopics: ["Recursion"] })?.reason).toBe("Quiz sa mahina mong topic: Recursion, pati ang susunod na dapat i-practice: Binary Trees.");
    expect(quiz({ ...base, lang: "en", weakTopics: ["Binary Trees", "Recursion"] })?.reason).toBe("A quiz on your weak topics: Binary Trees and Recursion.");
  });

  it("starts concepts never studied with the rule table's method, in the quiz's place", () => {
    const draft = planTamariBlocks({ ...base, lang: "en", weakTopics: [], exam: { title: "Midterm", daysLeft: 3 }, fresh: { names: ["Graphs", "Heaps"], method: "chunking" } });
    expect(draft.blocks.map((block) => block.key)).toEqual(["recall", "learn", "feynman", "mistakes", "retest"]);
    const learn = draft.blocks[1];
    expect(learn).toMatchObject({ method: "chunking", label: "Chunking", concepts: ["Graphs", "Heaps"], minutes: 7 });
    expect(learn.reason).toBe("Graphs and Heaps are new to you. Small pieces first, then a few easy questions on each.");
    expect(planTamariBlocks({ ...base, lang: "taglish", weakTopics: [], fresh: { names: ["Graphs"], method: "blurting" } }).blocks[1].reason).toBe(
      "Bago pa sa'yo ang Graphs. Basahin mo, tapos isulat lahat ng naaalala mo.",
    );
  });

  it("keeps the Weak Topic Quiz next to concepts never studied while some topics are weak", () => {
    const input = { ...base, lang: "en" as const, fresh: { names: ["Graphs", "Heaps"], method: "chunking" as const } };
    const draft = planTamariBlocks(input);
    expect(draft.blocks.map((block) => block.key)).toEqual(["recall", "learn", "quiz", "mistakes", "retest"]);
    expect(draft.blocks.find((block) => block.key === "quiz")).toMatchObject({ label: "Weak Topic Quiz", focus: "Binary Trees, Recursion" });
    for (const minutes of [10, 15, 20, 30, 45, 60]) {
      const blocks = planTamariBlocks({ ...input, minutes }).blocks;
      expect(blocks.reduce((sum, block) => sum + block.minutes, 0)).toBe(minutes);
      expect(blocks.some((block) => block.key === "quiz")).toBe(true);
      expect(blocks.some((block) => block.key === "learn")).toBe(true);
    }
    // Five minutes hold one block: the quiz on the weak topics.
    expect(shape({ ...input, minutes: 5 })).toEqual(["quiz:5"]);
  });

  it("works without a material: the notebook and cards, else a plain focus block", () => {
    expect(shape({ ...base, material: null })).toEqual(["mistakes:10", "cards:10"]);
    const focus = planTamariBlocks({ ...base, material: null, openMistakes: 0, dueCards: 0, minutes: 25 });
    expect(focus.blocks).toHaveLength(1);
    expect(focus.blocks[0]).toMatchObject({ key: "focus", method: "pomodoro", minutes: 25 });
  });
});

describe("Tamari's reaction to a finished plan", () => {
  it("cheers a strong result and notices the retest beat the first quiz", () => {
    expect(planDoneLine("taglish", { correct: 9, answered: 10, firstAccuracy: 0.6, lastAccuracy: 1 })).toEqual({ state: "confident", text: "Bitaw. 9/10. Mas okay na." });
    expect(planDoneLine("taglish", { correct: 9, answered: 10, firstAccuracy: null, lastAccuracy: null }).text).toBe("Bitaw. 9/10. Gets mo na 'to.");
    expect(planDoneLine("en", { correct: 3, answered: 10, firstAccuracy: 0.3, lastAccuracy: 0.3 })).toMatchObject({ state: "serious" });
    expect(planDoneLine("taglish", { correct: 0, answered: 0, firstAccuracy: null, lastAccuracy: null }).state).toBe("idle");
  });

  it("reads the summary a plan saves", () => {
    expect(planReaction("taglish", { correct: 9, questionsAnswered: 10, extra: { firstAccuracy: 0.5, lastAccuracy: 0.9 } }).text).toBe("Bitaw. 9/10. Mas okay na.");
    expect(planReaction("taglish", { correct: 6, questionsAnswered: 10, extra: { firstAccuracy: "x" } }).text).toBe("6/10. Isa pa bukas, balikan natin.");
  });

  it("counts in Filipino", () => {
    expect(timesInFilipino(3)).toBe("Tatlong beses");
    expect(timesInFilipino(4)).toBe("Apat na beses");
    expect(timesInFilipino(12)).toBe("12 beses");
  });
});
