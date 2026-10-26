import { describe, expect, it } from "vitest";

import { addDays, dateIn, daysBetween, hourIn, isIsoDate, isValidTimezone, relativeDays, weekStartOf, weekdayOf } from "@/lib/planner/dates";
import { allocateSlots, generatePlan, readinessScore, slotMinutes, studyDaysBetween, type PlanInput, type PlanMaterial } from "@/lib/planner/generate";

const material = (overrides: Partial<PlanMaterial> = {}): PlanMaterial => ({
  id: "m1",
  title: "Photosynthesis",
  estimatedMinutes: 60,
  difficulty: "intermediate",
  conceptHeavy: false,
  mastery: null,
  coverage: null,
  weakConcepts: [],
  openMistakes: 0,
  hasFlashcards: false,
  ...overrides,
});

const base: PlanInput = {
  today: "2026-10-20",
  examDate: "2026-11-03",
  examTitle: "Biology midterm",
  topics: [],
  availableDays: [0, 1, 2, 3, 4, 5, 6],
  minutesPerDay: 60,
  mode: "exam",
  confidence: null,
  priority: "normal",
  materials: [material(), material({ id: "m2", title: "Cell respiration", estimatedMinutes: 90, conceptHeavy: true, mastery: 30, weakConcepts: ["Krebs cycle", "ATP"], openMistakes: 2, hasFlashcards: true })],
  dueCards: 4,
};

describe("planner dates", () => {
  it("converts instants to calendar dates per time zone", () => {
    const instant = new Date("2026-10-20T20:30:00Z");
    expect(dateIn(instant, "UTC")).toBe("2026-10-20");
    expect(dateIn(instant, "Asia/Manila")).toBe("2026-10-21");
    // An unknown zone counts as RevTaw's home zone (Manila).
    expect(dateIn(instant, "not/a-zone")).toBe("2026-10-21");
    expect(dateIn(instant, null)).toBe("2026-10-21");
    expect(hourIn(instant, "Asia/Manila")).toBe(4);
    expect(isValidTimezone("Europe/Berlin")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
  });

  it("does date arithmetic on ISO strings", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(daysBetween("2026-10-20", "2026-11-03")).toBe(14);
    expect(daysBetween("2026-11-03", "2026-10-20")).toBe(-14);
    expect(weekdayOf("2026-10-20")).toBe(2);
    expect(weekStartOf("2026-10-25")).toBe("2026-10-19");
    expect(relativeDays("2026-10-21", "2026-10-20")).toBe("Tomorrow");
    expect(relativeDays("2026-10-18", "2026-10-20")).toBe("2 days ago");
  });
});

describe("plan generator", () => {
  it("picks study days on available weekdays before the exam", () => {
    const days = studyDaysBetween("2026-10-20", "2026-11-03", [1, 3, 5]);
    expect(days).toEqual(["2026-10-21", "2026-10-23", "2026-10-26", "2026-10-28", "2026-10-30", "2026-11-02"]);
    expect(studyDaysBetween("2026-10-20", "2026-10-20", [0, 1, 2, 3, 4, 5, 6])).toEqual([]);
  });

  it("splits slots by weight with at least one per material", () => {
    expect(allocateSlots([1, 1, 1], 6)).toEqual([2, 2, 2]);
    expect(allocateSlots([10, 1], 4).reduce((a, b) => a + b, 0)).toBe(4);
    expect(allocateSlots([10, 1], 4)[1]).toBe(1);
    expect(allocateSlots([5, 5, 5], 2).reduce((a, b) => a + b, 0)).toBe(2);
    expect(slotMinutes(60)).toBe(25);
    expect(slotMinutes(30)).toBe(15);
    expect(slotMinutes(15)).toBe(15);
  });

  it("builds an exam plan with coverage, 1-3-7-14 reviews, final days and exam-day rapid review", () => {
    const plan = generatePlan(base);
    expect(plan.mode).toBe("exam");
    expect(plan.studyDays).toHaveLength(14);
    const dates = [...new Set(plan.tasks.map((task) => task.scheduledFor))];
    expect(dates[0]).toBe("2026-10-20");
    expect(dates.at(-1)).toBe("2026-11-03");
    // Every study day stays within the daily budget.
    for (const date of plan.studyDays) {
      const minutes = plan.tasks.filter((task) => task.scheduledFor === date).reduce((sum, task) => sum + task.minutes, 0);
      expect(minutes).toBeLessThanOrEqual(60);
      expect(minutes).toBeGreaterThan(0);
    }
    // Both materials get first passes, the weaker one more.
    const coverage = plan.tasks.filter((task) => task.phase === "coverage");
    expect(coverage.filter((task) => task.materialId === "m2").length).toBeGreaterThan(coverage.filter((task) => task.materialId === "m1").length);
    expect(coverage.some((task) => task.method === "feynman" && task.materialId === "m2")).toBe(true);
    // Reviews follow the 1-3-7-14 cadence after the first pass.
    const reviews = plan.tasks.filter((task) => task.method === "review" && task.materialId === "m1");
    expect(reviews.map((task) => task.reason)).toEqual(expect.arrayContaining([expect.stringContaining("Day 1 review"), expect.stringContaining("Day 3 review"), expect.stringContaining("Day 7 review")]));
    // Final days: mistake review + exam simulation, then rapid review on the eve and on exam day.
    const eve = plan.tasks.filter((task) => task.scheduledFor === "2026-11-01");
    expect(eve.map((task) => task.method)).toEqual(expect.arrayContaining(["error_review", "exam_simulation"]));
    const dayBefore = plan.tasks.filter((task) => task.scheduledFor === "2026-11-02");
    expect(dayBefore.find((task) => /Rapid review/.test(task.title))).toMatchObject({ method: "rapid_review", minutes: 15 });
    expect(plan.tasks.filter((task) => task.scheduledFor === "2026-11-03")).toHaveLength(1);
    expect(plan.tasks.find((task) => task.scheduledFor === "2026-11-03")).toMatchObject({ method: "rapid_review", title: expect.stringMatching(/Rapid review/) });
    expect(plan.warnings).toEqual([]);
  });

  it("falls back to cram mode when fewer than three study days remain", () => {
    const plan = generatePlan({ ...base, examDate: "2026-10-22" });
    expect(plan.mode).toBe("cram");
    expect(plan.warnings.join(" ")).toMatch(/Cram Mode/);
    const firstDay = plan.tasks.filter((task) => task.scheduledFor === "2026-10-20");
    expect(firstDay[0].method).toBe("error_review");
    expect(firstDay.some((task) => task.method === "active_recall" && task.materialId === "m2")).toBe(true);
    expect(firstDay.reduce((sum, task) => sum + task.minutes, 0)).toBe(60);
  });

  it("uses every day when the chosen weekdays never occur, and focus blocks without materials", () => {
    const plan = generatePlan({ ...base, examDate: "2026-10-25", availableDays: [1], materials: [], topics: ["Chapter 4", "Chapter 5"] });
    expect(plan.warnings.join(" ")).toMatch(/every remaining day/);
    expect(plan.tasks.every((task) => task.method === "pomodoro")).toBe(true);
    expect(plan.tasks[0].title).toBe("Focused study: Chapter 4");
  });

  it("doesn't treat a material as done after a few of its concepts", () => {
    // One concept of thirty answered well: planned like an untouched material, not like one at 95%.
    const partly = material({ id: "m1", mastery: 95, coverage: { practiced: 1, total: 30 } });
    const untouched = material({ id: "m2", title: "Cell respiration" });
    const plan = generatePlan({ ...base, materials: [partly, untouched] });
    const firstPasses = (id: string) => plan.tasks.filter((task) => task.phase === "coverage" && task.materialId === id).length;
    expect(Math.abs(firstPasses("m1") - firstPasses("m2"))).toBeLessThanOrEqual(1);
    const recall = plan.tasks.find((task) => task.materialId === "m1" && task.method === "active_recall");
    expect(recall?.reason).toBe("You've practiced 1 of 30 concepts in Photosynthesis so far (95% on those).");
    const test = plan.tasks.find((task) => task.materialId === "m1" && task.method === "practice_testing" && task.phase === "review");
    expect(test?.reason).toMatch(/\(1 of 30 concepts practiced, 95% on those\)/);
    // Every concept practiced: the average is the material's mastery.
    const whole = generatePlan({ ...base, materials: [material({ mastery: 72, coverage: { practiced: 12, total: 12 } })] });
    expect(whole.tasks.find((task) => task.method === "active_recall")?.reason).toBe("Photosynthesis sits at 72% mastery.");
  });

  it("handles a past exam and the exam day itself", () => {
    expect(generatePlan({ ...base, examDate: "2026-10-19" }).tasks).toEqual([]);
    const today = generatePlan({ ...base, examDate: "2026-10-20" });
    expect(today.tasks).toHaveLength(1);
    expect(today.tasks[0].scheduledFor).toBe("2026-10-20");
  });

  it("estimates readiness from mastery and plan completion", () => {
    expect(readinessScore({ averageMastery: null, tasksDone: 0, tasksTotal: 0 })).toBeNull();
    expect(readinessScore({ averageMastery: 80, tasksDone: 5, tasksTotal: 10 })).toBe(71);
    expect(readinessScore({ averageMastery: null, tasksDone: 5, tasksTotal: 10 })).toBe(25);
  });

  it("counts the exam's concepts not practiced yet as 0", () => {
    // One concept of thirty at 95%, no task done: not 67% ready.
    expect(readinessScore({ averageMastery: 95, concepts: { practiced: 1, total: 30 }, tasksDone: 0, tasksTotal: 20 })).toBe(2);
    expect(readinessScore({ averageMastery: 60, concepts: { practiced: 30, total: 30 }, tasksDone: 10, tasksTotal: 20 })).toBe(57);
    // Without the materials' concept lists, the practiced average stands.
    expect(readinessScore({ averageMastery: 80, concepts: null, tasksDone: 5, tasksTotal: 10 })).toBe(71);
  });
});
