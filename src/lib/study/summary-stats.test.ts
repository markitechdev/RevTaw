import { describe, expect, it } from "vitest";

import { conceptChanges, preTestLayout } from "@/lib/study/flows/pretest";
import { countLabelsFor, extraStatsFor } from "@/lib/study/summary-stats";

describe("summary stats", () => {
  it("shows blocks for every plan method and the before-and-after for pre-testing", () => {
    expect(extraStatsFor("smart_study", { blocksDone: 2, blocksTotal: 3 })).toEqual([{ label: "Blocks done", value: "2/3" }]);
    expect(extraStatsFor("pre_testing", { blocksDone: 3, blocksTotal: 3, preScore: 40, postScore: 75 })).toEqual([
      { label: "Blocks done", value: "3/3" },
      { label: "Pre-test", value: "40%" },
      { label: "Post-test", value: "75%" },
      { label: "Improvement", value: "+35 pts" },
    ]);
    expect(extraStatsFor("pre_testing", { blocksDone: 1, blocksTotal: 3, preScore: 40 })).toEqual([
      { label: "Blocks done", value: "1/3" },
      { label: "Pre-test", value: "40%" },
      { label: "Post-test", value: "—" },
    ]);
    expect(extraStatsFor("active_recall", { preScore: 40 })).toEqual([]);
  });

  it("keeps the other methods' stats", () => {
    // A tutor conversation's score is its accuracy tile; the stats count its replies.
    expect(extraStatsFor("teach_back", { score: 82.4, studentTurns: 6 })).toEqual([{ label: "Your replies", value: "6" }]);
    expect(countLabelsFor("teach_back")).toEqual({ answered: null, correct: null, incorrect: null, accuracy: "Teaching score" });
    expect(countLabelsFor("socratic_questioning")?.accuracy).toBe("Reasoning score");
    expect(countLabelsFor("active_recall")).toBeUndefined();
    expect(extraStatsFor("pomodoro", { completedRounds: 2 })).toEqual([{ label: "Rounds", value: "2" }]);
    expect(extraStatsFor("question_generation", { averageQuality: 71 })).toEqual([{ label: "Average quality", value: "71%" }]);
  });
});

describe("pre-testing plan", () => {
  it("splits the time into test, study and test, with 4-10 questions", () => {
    expect(preTestLayout(30)).toEqual({ testMinutes: 8, studyMinutes: 14, questionCount: 6 });
    expect(preTestLayout(10)).toEqual({ testMinutes: 3, studyMinutes: 5, questionCount: 4 });
    expect(preTestLayout(60)).toEqual({ testMinutes: 15, studyMinutes: 30, questionCount: 10 });
  });

  it("lines up each concept's before and after", () => {
    const pretest = { preScore: 50, concepts: ["ATP", "Calvin cycle"], attention: ["ATP"], byConcept: { ATP: 0, "Calvin cycle": 100 } };
    expect(conceptChanges(pretest, null)).toEqual([
      { concept: "ATP", before: 0, after: null },
      { concept: "Calvin cycle", before: 100, after: null },
    ]);
    expect(conceptChanges(pretest, { postScore: 100, byConcept: { ATP: 100, Chlorophyll: 100 } })).toEqual([
      { concept: "ATP", before: 0, after: 100 },
      { concept: "Calvin cycle", before: 100, after: null },
      { concept: "Chlorophyll", before: null, after: 100 },
    ]);
    expect(conceptChanges(null, null)).toEqual([]);
  });
});
