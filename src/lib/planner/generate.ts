import { addDays, daysBetween, weekdayOf } from "@/lib/planner/dates";
import { coveredMastery, masteryWords, partlyPracticed, type ConceptCoverage } from "@/lib/planner/material-progress";
import type { StudyMethodId } from "@/lib/study/methods";
import type { ConfidenceLevel, ExamPriority, PlanMode } from "@/lib/supabase/database.types";

/**
 * Exam study plan generator (§30, "Exam Study Plan", "Cram Mode",
 * "1-3-7-14 Review"). Pure and deterministic so it can be unit-tested and
 * re-run whenever the inputs change (new material, missed day, new scores).
 *
 * Shape of an exam plan:
 *   coverage days  — every material gets interleaved first-pass slots
 *                    (recall → test → Feynman for concept-heavy material),
 *                    weighted by its size and how weak it still is;
 *   review days    — 1-3-7-14 reviews after each material's first slot, plus
 *                    practice tests, mistake reviews and flashcard sweeps;
 *   final days     — mistake review + exam simulation, then a rapid review
 *                    of weak concepts and a short rapid review on exam day.
 * Cram mode (chosen, or forced when fewer than three study days remain)
 * packs each day with mistakes → weak-concept recall → definitions → practice.
 */

export type PlanMaterial = {
  id: string;
  title: string;
  /** From the material analysis; null when not analyzed. */
  estimatedMinutes: number | null;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  /** Understanding/application concepts dominate → Feynman earns a slot. */
  conceptHeavy: boolean;
  /** Average mastery of practiced concepts (0-100), null when untouched. */
  mastery: number | null;
  /** Its concepts practiced, of all of them (the analysis's key concepts and any practiced); null when neither names any. */
  coverage: ConceptCoverage | null;
  weakConcepts: string[];
  openMistakes: number;
  hasFlashcards: boolean;
};

export type PlanInput = {
  today: string;
  examDate: string;
  examTitle: string;
  topics: string[];
  availableDays: number[];
  minutesPerDay: number;
  mode: PlanMode;
  confidence: ConfidenceLevel | null;
  priority: ExamPriority;
  materials: PlanMaterial[];
  dueCards: number;
};

export type PlanPhase = "coverage" | "review" | "final" | "cram";

export type PlannedTask = {
  key: string;
  scheduledFor: string;
  position: number;
  method: StudyMethodId | "review";
  title: string;
  reason: string;
  minutes: number;
  materialId: string | null;
  concepts: string[];
  phase: PlanPhase;
};

export type GeneratedPlan = {
  mode: PlanMode;
  studyDays: string[];
  tasks: PlannedTask[];
  warnings: string[];
};

export const CRAM_NOTE = "Cram Mode makes the most of limited time; it is not a substitute for regular spaced study.";
export const REVIEW_OFFSETS = [1, 3, 7, 14] as const;

/** Slot length that fits the daily budget: 25-minute blocks for an hour, 15 for half an hour, otherwise the whole budget. */
export function slotMinutes(minutesPerDay: number): number {
  if (minutesPerDay >= 50) return 25;
  if (minutesPerDay >= 30) return 15;
  if (minutesPerDay >= 20) return 10;
  return minutesPerDay;
}

/** Study days strictly before the exam that fall on an available weekday. */
export function studyDaysBetween(today: string, examDate: string, availableDays: number[]): string[] {
  const days: string[] = [];
  const span = daysBetween(today, examDate);
  if (span <= 0) return days;
  const allowed = new Set(availableDays);
  for (let offset = 0; offset < span && days.length < 120; offset += 1) {
    const date = addDays(today, offset);
    if (allowed.has(weekdayOf(date))) days.push(date);
  }
  return days;
}

type DayPlan = { date: string; used: number; tasks: PlannedTask[] };

/**
 * What a material is taken to be at when planning: its practiced concepts at their mastery, and an
 * untouched material, or the concepts of one not practiced yet, at `unknown`. One concept answered well
 * doesn't make a material of thirty look done.
 */
function plannedMastery(material: PlanMaterial, unknown: number): number {
  return coveredMastery(material.mastery, material.coverage, unknown) ?? unknown;
}

function materialWeight(material: PlanMaterial): number {
  const size = Math.max(15, material.estimatedMinutes ?? 60);
  const gap = (100 - plannedMastery(material, 55)) / 100;
  return size * (1 + gap) * (material.openMistakes > 0 ? 1.1 : 1);
}

/** Largest-remainder split of `total` slots over weights, at least one each when possible. */
export function allocateSlots(weights: number[], total: number): number[] {
  const n = weights.length;
  if (n === 0 || total <= 0) return weights.map(() => 0);
  const sum = weights.reduce((acc, weight) => acc + weight, 0) || 1;
  const raw = weights.map((weight) => (total * weight) / sum);
  const result = raw.map((value) => Math.floor(value));
  if (total >= n) result.forEach((value, index) => { if (value === 0) result[index] = 1; });
  let remaining = total - result.reduce((acc, value) => acc + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  let cursor = 0;
  while (remaining > 0) {
    result[order[cursor % n].index] += 1;
    remaining -= 1;
    cursor += 1;
  }
  while (remaining < 0) {
    const largest = result.indexOf(Math.max(...result));
    if (result[largest] <= (total >= n ? 1 : 0)) break;
    result[largest] -= 1;
    remaining += 1;
  }
  return result;
}

function methodCycle(material: PlanMaterial): StudyMethodId[] {
  const deep = material.conceptHeavy || material.difficulty === "advanced";
  return deep ? ["active_recall", "feynman", "practice_testing"] : ["active_recall", "practice_testing", "active_recall"];
}

function titleFor(method: StudyMethodId | "review", material: PlanMaterial | null, fallback: string): string {
  const name = material?.title ?? fallback;
  switch (method) {
    case "active_recall":
      return `Active recall: ${name}`;
    case "practice_testing":
      return `Practice test: ${name}`;
    case "feynman":
      return `Explain it (Feynman): ${name}`;
    case "error_review":
      return "Mistake review";
    case "spaced_repetition":
      return material ? `Flashcards: ${name}` : "Flashcard sweep";
    case "review":
      return `Review: ${name}`;
    case "pomodoro":
      return `Focused study: ${name}`;
    default:
      return name;
  }
}

function coverageReason(method: StudyMethodId, material: PlanMaterial, pass: number): string {
  const weak = material.weakConcepts.slice(0, 2).join(" and ");
  if (method === "active_recall") {
    if (pass === 0) {
      if (material.mastery === null) return `First pass on ${material.title}: pull the key ideas from memory before re-reading them.`;
      const first = weak ? ` — ${weak} first` : "";
      return partlyPracticed(material.coverage)
        ? `You've practiced ${material.coverage.practiced} of ${material.coverage.total} concepts in ${material.title} so far (${Math.round(material.mastery)}% on those)${first}.`
        : `${material.title} sits at ${Math.round(material.mastery)}% mastery${first}.`;
    }
    return weak ? `Second recall pass, aimed at ${weak}.` : `Second recall pass over ${material.title} to lock it in.`;
  }
  if (method === "feynman") return `Concept-heavy material: explaining ${weak || "the main ideas"} to a beginner shows what you only half understand.`;
  return `A short adaptive test on ${material.title} measures every concept and feeds your mastery.`;
}

export function generatePlan(input: PlanInput): GeneratedPlan {
  const warnings: string[] = [];
  const minutesPerDay = Math.max(5, Math.min(480, Math.round(input.minutesPerDay)));
  const examPast = daysBetween(input.today, input.examDate) < 0;
  if (examPast) return { mode: input.mode, studyDays: [], tasks: [], warnings: ["The exam date has passed."] };

  let studyDays = studyDaysBetween(input.today, input.examDate, input.availableDays);
  if (studyDays.length === 0 && daysBetween(input.today, input.examDate) > 0) {
    studyDays = studyDaysBetween(input.today, input.examDate, [0, 1, 2, 3, 4, 5, 6]);
    warnings.push("None of your available days fall before the exam, so every remaining day is used.");
  }
  let mode = input.mode;
  if (mode === "exam" && studyDays.length < 3) {
    mode = "cram";
    if (studyDays.length > 0) warnings.push("Fewer than three study days remain, so the plan uses Cram Mode.");
  }
  if (mode === "cram") warnings.push(CRAM_NOTE);
  if (input.materials.length === 0) warnings.push("Attach materials to this exam to get recall sessions, practice tests and 1-3-7-14 reviews instead of plain focus blocks.");

  const slot = slotMinutes(minutesPerDay);
  const slotsPerDay = Math.max(1, Math.floor(minutesPerDay / slot));
  const days: DayPlan[] = studyDays.map((date) => ({ date, used: 0, tasks: [] }));
  const byDate = new Map(days.map((day) => [day.date, day]));
  let serial = 0;
  const push = (day: DayPlan, task: Omit<PlannedTask, "key" | "position" | "scheduledFor">): PlannedTask => {
    serial += 1;
    const planned: PlannedTask = { ...task, key: `t${serial}`, position: day.tasks.length, scheduledFor: day.date };
    day.tasks.push(planned);
    day.used += task.minutes;
    return planned;
  };
  const free = (day: DayPlan) => minutesPerDay - day.used;
  const totalMistakes = input.materials.reduce((sum, material) => sum + material.openMistakes, 0);
  const anyFlashcards = input.materials.some((material) => material.hasFlashcards) || input.dueCards > 0;
  const weakest = [...input.materials].sort((a, b) => plannedMastery(a, 50) - plannedMastery(b, 50));

  if (mode === "cram") {
    for (const day of days) {
      let guard = 0;
      if (totalMistakes > 0 && free(day) >= 5) push(day, { method: "error_review", title: "Mistake review", reason: `${totalMistakes} open mistake${totalMistakes === 1 ? "" : "s"} — the fastest marks to win back.`, minutes: Math.min(10, slot, free(day)), materialId: null, concepts: [], phase: "cram" });
      while (free(day) >= 5 && guard < 12) {
        const material = weakest[guard % Math.max(1, weakest.length)] ?? null;
        const step = Math.floor(guard / Math.max(1, weakest.length));
        if (!material) {
          const topic = input.topics[guard % Math.max(1, input.topics.length)] ?? input.examTitle;
          push(day, { method: "pomodoro", title: titleFor("pomodoro", null, topic), reason: "No material attached: a focused block on the topic you named.", minutes: free(day), materialId: null, concepts: input.topics.slice(0, 6), phase: "cram" });
          break;
        }
        const method: StudyMethodId = step === 0 ? "active_recall" : step === 1 ? (material.hasFlashcards ? "spaced_repetition" : "practice_testing") : "practice_testing";
        const minutes = Math.min(slot, free(day));
        push(day, {
          method,
          title: titleFor(method, material, input.examTitle),
          reason:
            method === "active_recall"
              ? `Weak areas first: ${material.weakConcepts.slice(0, 3).join(", ") || material.title} from memory.`
              : method === "spaced_repetition"
                ? "Definitions and terms are the highest-value memory items before an exam."
                : "Practice under time pressure shows what still breaks.",
          minutes,
          materialId: material.id,
          concepts: material.weakConcepts.slice(0, 6),
          phase: "cram",
        });
        guard += 1;
      }
    }
  } else {
    const n = days.length;
    const finalCount = n >= 6 ? 2 : 1;
    const finalDays = days.slice(n - finalCount);
    const working = days.slice(0, n - finalCount);
    const coverageCount = Math.max(1, Math.ceil(working.length * 0.6));
    const reviewMinutes = Math.max(5, Math.round(slot * 0.6));
    const fillerMin = Math.min(10, slot);

    // Coverage queue: interleaved first passes, weighted by size and weakness.
    const queue: Array<{ material: PlanMaterial; pass: number }> = [];
    if (input.materials.length > 0) {
      const slotCounts = allocateSlots(input.materials.map(materialWeight), coverageCount * slotsPerDay);
      const maxPasses = Math.max(...slotCounts);
      for (let pass = 0; pass < maxPasses; pass += 1) {
        input.materials.forEach((material, index) => {
          if (slotCounts[index] > pass) queue.push({ material, pass });
        });
      }
    }
    // 1-3-7-14 reviews are queued when a material gets its first pass and
    // placed on the first study day at or after their target date.
    const pendingReviews: Array<{ material: PlanMaterial; offset: number; target: string }> = [];
    const firstSlotDay = new Map<string, string>();
    let rotation = 0;

    working.forEach((day, index) => {
      // 1. Reviews that are due (at most two per day so they never crowd out new material).
      let placedReviews = 0;
      for (const review of [...pendingReviews].sort((a, b) => a.target.localeCompare(b.target))) {
        if (placedReviews >= 2 || review.target > day.date || free(day) < reviewMinutes) continue;
        push(day, { method: "review", title: titleFor("review", review.material, input.examTitle), reason: `Day ${review.offset} review (1-3-7-14): a short recall pass keeps ${review.material.title} from fading.`, minutes: reviewMinutes, materialId: review.material.id, concepts: review.material.weakConcepts.slice(0, 6), phase: "review" });
        pendingReviews.splice(pendingReviews.indexOf(review), 1);
        placedReviews += 1;
      }
      // 2. First passes.
      while (queue.length && free(day) >= fillerMin) {
        const { material, pass } = queue.shift()!;
        const cycle = methodCycle(material);
        const method = cycle[pass % cycle.length];
        push(day, { method, title: titleFor(method, material, input.examTitle), reason: coverageReason(method, material, pass), minutes: Math.min(free(day), slot), materialId: material.id, concepts: material.weakConcepts.slice(0, 6), phase: "coverage" });
        if (!firstSlotDay.has(material.id)) {
          firstSlotDay.set(material.id, day.date);
          for (const offset of REVIEW_OFFSETS) {
            const target = addDays(day.date, offset);
            if (daysBetween(target, input.examDate) > finalCount) pendingReviews.push({ material, offset, target });
          }
        }
      }
      if (input.materials.length === 0 && free(day) >= fillerMin) {
        const topic = input.topics[index % Math.max(1, input.topics.length)] ?? input.examTitle;
        push(day, { method: "pomodoro", title: titleFor("pomodoro", null, topic), reason: "No material attached yet: a focused block on the topic you named.", minutes: free(day), materialId: null, concepts: input.topics.slice(0, 6), phase: "coverage" });
      }
      // 3. Consolidation fillers once the first passes are done: never the same
      //    method on the same material twice in a day.
      let guard = 0;
      const usedToday = new Set(day.tasks.map((task) => `${task.materialId ?? "-"}:${task.method}`));
      while (queue.length === 0 && input.materials.length > 0 && free(day) >= fillerMin && guard < 8) {
        const choice = rotation % 3;
        rotation += 1;
        guard += 1;
        if (choice === 1 && totalMistakes > 0 && !usedToday.has("-:error_review")) {
          push(day, { method: "error_review", title: "Mistake review", reason: "Retesting open mistakes before the exam turns them into learned concepts.", minutes: Math.min(slot, free(day), 15), materialId: null, concepts: [], phase: "review" });
          usedToday.add("-:error_review");
          continue;
        }
        if (choice === 2 && anyFlashcards && !usedToday.has("-:spaced_repetition")) {
          push(day, { method: "spaced_repetition", title: "Flashcard sweep", reason: "Due cards first; spaced repetition only works when reviews happen on time.", minutes: Math.min(slot, free(day)), materialId: null, concepts: [], phase: "review" });
          usedToday.add("-:spaced_repetition");
          continue;
        }
        let placed = false;
        for (let step = 0; step < weakest.length && !placed; step += 1) {
          const material = weakest[(rotation + step) % weakest.length];
          const options: StudyMethodId[] = ["practice_testing", "active_recall", ...(material.conceptHeavy || material.difficulty === "advanced" ? (["feynman"] as StudyMethodId[]) : [])];
          const method = options.find((candidate) => !usedToday.has(`${material.id}:${candidate}`));
          if (!method) continue;
          const reason =
            method === "practice_testing"
              ? `Adaptive test on ${material.title}${material.mastery !== null ? ` (${masteryWords(material.mastery, material.coverage)})` : ""} to confirm the first pass held.`
              : method === "feynman"
                ? `Explain ${material.weakConcepts.slice(0, 2).join(" and ") || material.title} to a beginner — the gaps show up in your own words.`
                : `Recall pass over ${material.title}${material.weakConcepts.length ? ` (${material.weakConcepts.slice(0, 2).join(", ")})` : ""} to keep it strong.`;
          push(day, { method, title: titleFor(method, material, input.examTitle), reason, minutes: Math.min(slot, free(day)), materialId: material.id, concepts: material.weakConcepts.slice(0, 6), phase: "review" });
          usedToday.add(`${material.id}:${method}`);
          placed = true;
        }
        if (!placed) break;
      }
      // Leftover minutes extend the last task so the whole budget is used.
      const last = day.tasks[day.tasks.length - 1];
      if (last && free(day) > 0) {
        last.minutes += free(day);
        day.used = minutesPerDay;
      }
    });

    // Final days.
    const simulationMaterial = weakest[0] ?? null;
    if (finalDays.length === 2) {
      const [eve, last] = finalDays;
      if (totalMistakes > 0) push(eve, { method: "error_review", title: "Mistake review", reason: "Clear the notebook before the simulation.", minutes: Math.min(15, slot, free(eve)), materialId: null, concepts: [], phase: "final" });
      if (simulationMaterial && free(eve) >= 5) push(eve, { method: "exam_simulation", title: `Exam simulation: ${simulationMaterial.title}`, reason: "Timed, shuffled, no hints — the closest thing to the real exam.", minutes: free(eve), materialId: simulationMaterial.id, concepts: [], phase: "final" });
      else if (free(eve) >= 5) push(eve, { method: "pomodoro", title: titleFor("pomodoro", null, input.examTitle), reason: "Final focused review.", minutes: free(eve), materialId: null, concepts: input.topics.slice(0, 6), phase: "final" });
      if (simulationMaterial) push(last, { method: "rapid_review", title: `Rapid review: ${simulationMaterial.title}`, reason: "Weak concepts and definitions only — no new material the day before.", minutes: Math.min(15, slot, free(last)), materialId: simulationMaterial.id, concepts: simulationMaterial.weakConcepts.slice(0, 6), phase: "final" });
      if (anyFlashcards && free(last) >= 5) push(last, { method: "spaced_repetition", title: "Flashcard sweep", reason: "A last pass over every due card.", minutes: Math.min(slot, free(last)), materialId: null, concepts: [], phase: "final" });
      if (!simulationMaterial && free(last) >= 5) push(last, { method: "pomodoro", title: titleFor("pomodoro", null, input.examTitle), reason: "Light review the day before.", minutes: Math.min(slot, free(last)), materialId: null, concepts: input.topics.slice(0, 6), phase: "final" });
    } else if (finalDays.length === 1) {
      const [last] = finalDays;
      if (totalMistakes > 0) push(last, { method: "error_review", title: "Mistake review", reason: "Clear the notebook before the simulation.", minutes: Math.min(10, slot, free(last)), materialId: null, concepts: [], phase: "final" });
      if (simulationMaterial && free(last) >= 5) push(last, { method: "exam_simulation", title: `Exam simulation: ${simulationMaterial.title}`, reason: "Timed, shuffled, no hints — the closest thing to the real exam.", minutes: free(last), materialId: simulationMaterial.id, concepts: [], phase: "final" });
      else if (free(last) >= 5) push(last, { method: "pomodoro", title: titleFor("pomodoro", null, input.examTitle), reason: "Final focused review.", minutes: free(last), materialId: null, concepts: input.topics.slice(0, 6), phase: "final" });
    }
  }

  // Exam day: a short rapid review (5/10/15 minutes) of weak concepts.
  const examDay: DayPlan = byDate.get(input.examDate) ?? { date: input.examDate, used: 0, tasks: [] };
  if (!byDate.has(input.examDate)) days.push(examDay);
  const rapidMaterial = weakest[0] ?? null;
  push(examDay, {
    method: rapidMaterial ? "rapid_review" : "pomodoro",
    title: rapidMaterial ? `Rapid review: ${rapidMaterial.title}` : `Rapid review: ${input.examTitle}`,
    reason: "Exam day: five to fifteen minutes on weak concepts and definitions, then stop.",
    minutes: Math.min(15, Math.max(5, slot)),
    materialId: rapidMaterial?.id ?? null,
    concepts: rapidMaterial?.weakConcepts.slice(0, 6) ?? input.topics.slice(0, 6),
    phase: mode === "cram" ? "cram" : "final",
  });

  const tasks = days.flatMap((day) => day.tasks).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || a.position - b.position);
  return { mode, studyDays, tasks, warnings };
}

/**
 * Readiness estimate (0-100) shown with the countdown: mastery of the exam's materials blended with plan
 * completion. Concepts of those materials not practiced yet count as 0 (`concepts`: practiced of all), so
 * one concept answered well isn't "67% ready" for an exam on thirty.
 */
export function readinessScore(input: { averageMastery: number | null; concepts?: ConceptCoverage | null; tasksDone: number; tasksTotal: number }): number | null {
  if (input.averageMastery === null && input.tasksTotal === 0) return null;
  const completion = input.tasksTotal > 0 ? input.tasksDone / input.tasksTotal : 0;
  const known = coveredMastery(input.averageMastery, input.concepts);
  if (known === null) return Math.round(completion * 50);
  return Math.round(known * 0.7 + completion * 100 * 0.3);
}
