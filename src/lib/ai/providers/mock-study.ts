import { collectFacts, keywordsOf, type MockFact } from "@/lib/ai/providers/mock-text";

/**
 * Deterministic stand-ins for the Phase 8 (part 2) study-method prompts:
 * problems, scenarios, cases, guided reading, visuals, maps and memory
 * techniques. They derive their output from the material's own sentences so
 * the flows can be exercised end to end without an AI provider.
 */

function blockAfter(prompt: string, label: string, until: string[]): string {
  const start = prompt.indexOf(label);
  if (start === -1) return "";
  const rest = prompt.slice(start + label.length);
  const ends = until.map((marker) => rest.indexOf(marker)).filter((index) => index >= 0);
  return (ends.length ? rest.slice(0, Math.min(...ends)) : rest).trim();
}

function quoted(prompt: string, label: string): string {
  return prompt.match(new RegExp(`${label}:?\\n"""\\n([\\s\\S]*?)\\n"""`))?.[1]?.trim() ?? "";
}

function bullets(block: string): string[] {
  return [...block.matchAll(/^- (.+)$/gm)].map((match) => match[1].trim()).filter((point) => !/^\(/.test(point));
}

/** Share of the expected points whose keywords mostly appear in the text. */
export function pointCoverage(expected: string[], given: string): { covered: string[]; missing: string[]; ratio: number } {
  const words = new Set(keywordsOf(given));
  const covered: string[] = [];
  const missing: string[] = [];
  for (const point of expected) {
    const keys = keywordsOf(point);
    const hits = keys.filter((key) => words.has(key)).length;
    if (keys.length === 0 ? given.toLowerCase().includes(point.toLowerCase()) : hits / keys.length >= 0.5) covered.push(point);
    else missing.push(point);
  }
  return { covered, missing, ratio: expected.length ? covered.length / expected.length : 0 };
}

function topicOf(fact: MockFact): string {
  return fact.term ?? fact.sentence.split(" ").slice(0, 4).join(" ").replace(/[.,;:]$/, "");
}

// ---------------------------------------------------------------------------
// Problems: worked examples, faded examples, practice problems
// ---------------------------------------------------------------------------

function solutionFor(fact: MockFact) {
  const topic = topicOf(fact);
  const parts = keywordsOf(fact.definition ?? fact.sentence).slice(0, 3);
  return {
    steps: [
      { step: `Recall the rule: ${fact.sentence}`, explanation: "Every solution starts from what the material states." },
      { step: `Name the parts involved: ${parts.join(", ") || topic}`, explanation: `These are the pieces the material connects with ${topic}.` },
      { step: `Apply it to the case: ${fact.next ?? fact.definition ?? fact.sentence}`, explanation: "Match each part of the rule to the situation in the problem." },
      { step: `Check the result against the material's statement about ${topic}`, explanation: "A result that contradicts the material signals a slipped step." },
    ],
    final_answer: (fact.definition ?? fact.sentence).replace(/[.]$/, ""),
    alternative_approach: fact.next ? `Start from the related statement instead: ${fact.next}` : null,
  };
}

export function problemsHeuristically(transcript: string, prompt: string) {
  const count = Number(prompt.match(/Produce exactly (\d+) problems/)?.[1] ?? "3");
  const mode = prompt.match(/^Mode: (worked|faded|practice)$/m)?.[1] ?? "practice";
  const fixed = prompt.match(/Every problem is "(easy|medium|hard|challenge)"/)?.[1] ?? null;
  const facts = collectFacts(transcript);
  const pool = facts.length ? facts : [{ term: null, definition: null, sentence: "The material describes one main idea.", heading: "Overview", next: null }];
  const ladder = ["easy", "medium", "hard", "challenge"] as const;
  // Faded examples are one family: every problem uses the same fact pattern.
  const problems = Array.from({ length: Math.min(count, mode === "faded" ? 4 : pool.length) }, (_, index) => {
    const fact = pool[index % pool.length];
    const topic = topicOf(fact);
    const twin = pool[(index + 1) % pool.length];
    return {
      concept: topic.slice(0, 60),
      difficulty: fixed ?? ladder[Math.min(ladder.length - 1, Math.floor((index * ladder.length) / Math.max(1, count)))],
      problem: `Apply what the material says about ${topic} to a new case and work out, step by step, what follows.`,
      solution: solutionFor(fact),
      key_points: keywordsOf(fact.definition ?? fact.sentence).slice(0, 4),
      practice:
        mode === "worked"
          ? { problem: `Your turn: use the same method for ${topicOf(twin)} and state the result.`, solution: solutionFor(twin), key_points: keywordsOf(twin.definition ?? twin.sentence).slice(0, 4) }
          : null,
    };
  });
  return { problems };
}

export function problemEvaluationHeuristically(prompt: string) {
  const reference = blockAfter(prompt, "Reference solution:\n", ["\nKey points:"]);
  const finalAnswer = reference.match(/^Final answer: (.+)$/m)?.[1] ?? "";
  const keyPoints = bullets(blockAfter(prompt, "Key points:\n", ["\nStudent work:"]));
  const work = quoted(prompt, "Student work");
  const blank = work.length < 3 || work === "(blank)";
  const coverage = pointCoverage(keyPoints.length ? keyPoints : [finalAnswer], work);
  const finalCorrect = !blank && pointCoverage([finalAnswer], work).ratio === 1;
  const score = blank ? 0 : Math.round(coverage.ratio * 70 + (finalCorrect ? 30 : 0));
  return {
    verdict: score >= 80 ? "correct" : score >= 40 ? "partial" : "incorrect",
    score,
    final_answer_correct: finalCorrect,
    correct_steps: coverage.covered,
    errors: coverage.missing.map((point) => ({ step: point, issue: "This part of the method is missing from your working." })),
    error_type: blank ? "forgotten_information" : coverage.ratio >= 0.6 && !finalCorrect ? "calculation_error" : coverage.ratio < 0.3 ? "misunderstood_concept" : "forgotten_information",
    feedback: blank ? "Write your working step by step, even if you are unsure — the check shows where it goes wrong." : score >= 80 ? "Your method and result match the reference solution." : `You used ${coverage.covered.length} of ${keyPoints.length || 1} key steps. Compare your working with the reference solution step by step.`,
  };
}
