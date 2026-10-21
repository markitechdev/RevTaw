import { describe, expect, it } from "vitest";

import { dayIn, durationIn, parseTamariCommand, spokenDay } from "@/lib/tamari/commands";

// Wednesday, October 21, 2026.
const today = "2026-10-21";
const parse = (text: string) => parseTamariCommand(text, today);

describe("parseTamariCommand: planning the student's time", () => {
  it.each([
    ["Tamari, 20 minutes lang ako. Bahala ka na.", 20],
    ["Tamari, 10 minutes lang meron ako.", 10],
    ["10 minutes lang", 10],
    ["may 30 minutes ako", 30],
    ["Meron akong 45 mins, ikaw na bahala", 45],
    ["I have 20 minutes", 20],
    ["I only have 15 minutes, what should I review?", 15],
    ["I've got an hour", 60],
    ["isang oras lang ako ngayon", 60],
    ["kalahating oras lang meron ako", 30],
    ["Plan 25 minutes for me", 25],
    ["make me a 30 minute plan", 30],
    ["What can I study in 20 minutes?", 20],
    ["ano pwede kong aralin sa 20 minutes", 20],
    ["twenty minutes lang ako", 20],
  ])("%s → plan %i minutes", (text, minutes) => {
    expect(parse(text)).toEqual({ kind: "plan", minutes });
  });

  it.each(["How long is the Calvin cycle?", "The reaction takes 20 minutes, why?", "Explain photosynthesis in 5 steps", "What is a minute in astronomy?", "Photosynthesis takes hours?"])("%s → a question", (text) => {
    expect(parse(text)).toBeNull();
  });

  it("keeps plans between 5 minutes and two hours", () => {
    expect(durationIn("3 minutes lang")).toBe(5);
    expect(durationIn("4 hours")).toBe(120);
  });
});

describe("parseTamariCommand: quizzes", () => {
  it.each([
    ["Tamari, quiz me about Chapter 4.", "Chapter 4"],
    ["Quiz me on recursion please", "recursion"],
    ["test me on the Calvin cycle", "Calvin cycle"],
    ["Gawan mo ako ng quiz sa Binary Trees", "Binary Trees"],
    ["pa-quiz naman: give me a quiz about stacks", "stacks"],
  ])("%s → a quiz on %s", (text, topic) => {
    expect(parse(text)).toEqual({ kind: "quiz", topic });
  });

  it.each(["Quiz mo 'ko dito.", "Quiz mo ako", "quiz me", "Can you quiz me on this?"])("%s → a quiz on what is in view", (text) => {
    expect(parse(text)).toEqual({ kind: "quiz", topic: null });
  });

  it("leaves questions about quizzes alone", () => {
    expect(parse("What is a quiz?")).toBeNull();
    expect(parse("How many questions are in my last quiz?")).toBeNull();
  });
});

describe("parseTamariCommand: exams and the planner", () => {
  it("adds the exam on the day the student says", () => {
    expect(parse("May exam ako Friday, gawan mo 'ko review.")).toEqual({ kind: "exam", date: "2026-10-23", title: null });
    expect(parse("May Calculus exam ako sa Biyernes")).toEqual({ kind: "exam", date: "2026-10-23", title: "Calculus" });
    expect(parse("I have a Biology midterm on Monday")).toEqual({ kind: "exam", date: "2026-10-26", title: "Biology" });
    expect(parse("I have an exam tomorrow, help")).toEqual({ kind: "exam", date: "2026-10-22", title: null });
  });

  it("does not take a question about an exam for a new one", () => {
    expect(parse("When is my exam on Friday?")).toBeNull();
    expect(parse("What topics are on the exam?")).toBeNull();
  });

  it("moves the selected task to a day", () => {
    expect(parse("Move this to Friday")).toEqual({ kind: "move", date: "2026-10-23" });
    expect(parse("Ilipat mo 'to sa Biyernes")).toEqual({ kind: "move", date: "2026-10-23" });
    expect(parse("move it to tomorrow")).toEqual({ kind: "move", date: "2026-10-22" });
    expect(parse("reschedule this to next Monday")).toEqual({ kind: "move", date: "2026-11-02" });
  });
});

describe("dates", () => {
  it("reads days relative to today", () => {
    expect(dayIn("friday", today)).toBe("2026-10-23");
    expect(dayIn("wednesday", today)).toBe("2026-10-28");
    expect(dayIn("bukas", today)).toBe("2026-10-22");
    expect(dayIn("sa makalawa", today)).toBe("2026-10-23");
    expect(dayIn("ngayon", today)).toBe(today);
    expect(dayIn("someday", today)).toBeNull();
    expect(spokenDay("2026-10-23")).toBe("Friday, Oct 23");
  });
});
