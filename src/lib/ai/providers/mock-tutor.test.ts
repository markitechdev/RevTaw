import { describe, expect, it } from "vitest";

import { tutorReplyHeuristically } from "@/lib/ai/providers/mock";

const material = "[Section 0: Osmosis]\nOsmosis is the movement of water across a selectively permeable membrane.";
const turn = (message: string) =>
  [
    "<study_status>\nThe student's study data in RevTaw right now:\n- Weakest concepts: osmosis (35%).\n- No upcoming exam.\n</study_status>",
    `<material title="Biology">\n${material}\n</material>`,
    `<student_message>\n${message}\n</student_message>`,
  ].join("\n");

describe("the mock Tamari", () => {
  it("answers from the study status only when the question is about it, like a real model", () => {
    expect(tutorReplyHeuristically(material, turn("What topics am I weak at?"), "").answer).toMatch(/Here's what RevTaw shows for you right now/);
    expect(tutorReplyHeuristically(material, turn("Ano ang dapat kong aralin ngayon?"), "").answer).toMatch(/Weakest concepts: osmosis/);
    const lesson = tutorReplyHeuristically(material, turn("What is osmosis?"), "");
    expect(lesson).toMatchObject({ grounding: "material", sources: [{ position: 0 }] });
    expect(lesson.answer).not.toMatch(/Here's what RevTaw shows/);
  });

  it("answers from passages of all the student's materials by their number, or generally when none matches", () => {
    const notes = '[Passage 1 — "Economics Reviewer", Inflation, page 2]\nInflation is a general rise in prices.\n\n[Passage 2 — "Biology Notes", page 6]\nOsmosis moves water across a membrane.';
    const prompt = (message: string, passages: string) => `<material scope="all of the student's materials">\n${passages}\n</material>\n<student_message>\n${message}\n</student_message>`;
    const reply = tutorReplyHeuristically(notes, prompt("What is osmosis?", notes), "");
    expect(reply).toMatchObject({ grounding: "material", sources: [{ position: 2, heading: null, pages: "6" }] });
    expect(reply.answer).toMatch(/^From your “Biology Notes”: Osmosis moves water/);
    expect(tutorReplyHeuristically(notes, prompt("What is recursion?", notes), "")).toMatchObject({ grounding: "general", sources: [] });
    const none = "(nothing in their materials matches this question — answer from general knowledge)";
    expect(tutorReplyHeuristically(none, prompt("What is recursion?", none), "")).toMatchObject({ grounding: "general", sources: [] });
  });
});
