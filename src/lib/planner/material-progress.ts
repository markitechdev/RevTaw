/**
 * How far a student is with a material, or with an exam's materials: for exam readiness, plans and goals.
 * Pure and client-safe. A material's concepts are its analysis's key concepts plus any concept practiced
 * with it; the ones not practiced yet count as 0, so one concept answered well doesn't make a material of
 * thirty concepts "strong".
 */

/** Concepts practiced, of all of them. */
export type ConceptCoverage = { practiced: number; total: number };

/** Whether some of the concepts haven't been practiced yet. */
export function partlyPracticed(coverage: ConceptCoverage | null | undefined): coverage is ConceptCoverage {
  return Boolean(coverage && coverage.total > coverage.practiced);
}

/**
 * The practiced concepts' average mastery spread over all the concepts, the ones not practiced yet counting
 * as `unpracticed`: 0 for what the student has shown (readiness, goals, "already strong"), a planning
 * estimate when weighing how much study is left. Null when nothing is practiced.
 */
export function coveredMastery(averageOfPracticed: number | null, coverage: ConceptCoverage | null | undefined, unpracticed = 0): number | null {
  if (averageOfPracticed === null) return null;
  if (!partlyPracticed(coverage)) return averageOfPracticed;
  return (averageOfPracticed * coverage.practiced + unpracticed * (coverage.total - coverage.practiced)) / coverage.total;
}

/** "59% mastery", or "1 of 8 concepts practiced, 59% on those" while some aren't practiced yet; null when none is. */
export function masteryWords(averageOfPracticed: number | null, coverage: ConceptCoverage | null | undefined): string | null {
  if (averageOfPracticed === null) return null;
  const average = Math.round(averageOfPracticed);
  return partlyPracticed(coverage) ? `${coverage.practiced} of ${coverage.total} concepts practiced, ${average}% on those` : `${average}% mastery`;
}

/** The mastery every concept of a material needs before a "Finish a material" goal counts it as finished. */
export const FINISHED_CONCEPT_MASTERY = 60;

/**
 * A goal on one material, from the mastery of its practiced concepts and its coverage. "Reach 80% mastery"
 * counts the concepts not practiced yet as 0. "Finish" needs every concept at FINISHED_CONCEPT_MASTERY or
 * more: `current` is 1 when it is finished. `listed`: the material's analysis names its key concepts; without
 * them the concepts practiced so far are all that is known, so at least three are needed.
 */
export function materialGoalProgress(kind: "mastery" | "finish_material", practicedMastery: ReadonlyArray<number>, coverage: ConceptCoverage | null, listed = true): { current: number; detail: string } {
  const practiced = practicedMastery.length;
  if (kind === "mastery") {
    const average = practiced ? practicedMastery.reduce((sum, value) => sum + value, 0) / practiced : null;
    const current = Math.round(coveredMastery(average, coverage) ?? 0);
    if (average === null) return { current, detail: "No concepts practiced yet" };
    return {
      current,
      detail: partlyPracticed(coverage)
        ? `${current}%: ${coverage.practiced} of ${coverage.total} concepts practiced, ${Math.round(average)}% on those`
        : `${current}% average over ${practiced} concept${practiced === 1 ? "" : "s"}`,
    };
  }
  const total = Math.max(coverage?.total ?? 0, practiced);
  const solid = practicedMastery.filter((value) => value >= FINISHED_CONCEPT_MASTERY).length;
  return {
    current: total >= (listed ? 1 : 3) && solid === total ? 1 : 0,
    detail: practiced ? `${solid} of ${total} concepts at ${FINISHED_CONCEPT_MASTERY}% or more` : "Not started",
  };
}
