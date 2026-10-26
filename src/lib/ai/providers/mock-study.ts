import { collectFacts, keywordsOf, parseTranscriptSections, sentencesOf, splitInlineSections, type MockFact } from "@/lib/ai/providers/mock-text";

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
  const count = Number(prompt.match(/Produce (?:exactly|up to) (\d+) problems/)?.[1] ?? "3");
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
    score,
    final_answer_correct: finalCorrect,
    correct_steps: coverage.covered,
    errors: coverage.missing.map((point) => ({ step: point, issue: "This part of the method is missing from your working." })),
    error_type: blank ? "forgotten_information" : coverage.ratio >= 0.6 && !finalCorrect ? "calculation_error" : coverage.ratio < 0.3 ? "misunderstood_concept" : "forgotten_information",
    feedback: blank ? "Write your working step by step, even if you are unsure — the check shows where it goes wrong." : score >= 80 ? "Your method and result match the reference solution." : `You used ${coverage.covered.length} of ${keyPoints.length || 1} key steps. Compare your working with the reference solution step by step.`,
  };
}

// ---------------------------------------------------------------------------
// Scenario-based and case-based learning
// ---------------------------------------------------------------------------

export function scenariosHeuristically(transcript: string, prompt: string) {
  const count = Number(prompt.match(/Produce (?:exactly|up to) (\d+) scenarios/)?.[1] ?? "3");
  const facts = collectFacts(transcript);
  const pool = facts.length ? facts : [{ term: null, definition: null, sentence: "The material describes one main idea.", heading: "Overview", next: null }];
  const scenarios = Array.from({ length: Math.min(count, pool.length) }, (_, index) => {
    const fact = pool[index];
    const topic = topicOf(fact);
    const correct = `Apply what the material says: ${(fact.definition ?? fact.sentence).replace(/[.]$/, "")}`;
    const wrong = [`Ignore ${topic} and decide by intuition`, `Do the opposite of what the material states about ${topic}`, "Postpone the decision until unrelated details are collected"];
    const best = index % (wrong.length + 1);
    const options = [...wrong.slice(0, best), correct, ...wrong.slice(best)];
    return {
      title: `Deciding with ${topic}`,
      situation: `A team working on a real task runs into a situation that depends on ${topic}. ${fact.sentence} ${fact.next ?? ""}`.trim(),
      question: "What should the team do?",
      options,
      best_option: best,
      option_feedback: options.map((_, option) => (option === best ? `Best: it follows the material — ${fact.sentence}` : `Not the best: it does not use what the material says about ${topic}.`)),
      rationale: `The material states: ${fact.sentence}`,
      key_points: keywordsOf(fact.definition ?? fact.sentence).slice(0, 3),
      concept: topic.slice(0, 60),
    };
  });
  return { scenarios };
}

export function scenarioEvaluationHeuristically(prompt: string) {
  const keyPoints = bullets(blockAfter(prompt, "Key points:\n", ["\nStudent justification:"]));
  const justification = quoted(prompt, "Student justification");
  const blank = justification.length < 3 || justification === "(blank)";
  const coverage = pointCoverage(keyPoints, justification);
  const score = blank ? 0 : Math.round(coverage.ratio * 100);
  return {
    justification_score: score,
    strengths: coverage.covered.map((point) => `You used the idea of ${point}.`),
    gaps: coverage.missing.map((point) => `Bring in ${point}.`),
    feedback: blank ? "Explain why you chose that action — the reasoning is half of the answer." : score >= 70 ? "Your justification uses the material's key ideas." : "Tie your reasoning to the material's key ideas more directly.",
  };
}

export function casesHeuristically(transcript: string, prompt: string) {
  const count = Number(prompt.match(/Produce (?:exactly|up to) (\d+) cases/)?.[1] ?? "1");
  const sections = parseTranscriptSections(transcript);
  const pool = sections.length ? sections : [{ heading: "Overview", text: transcript }];
  const cases = Array.from({ length: Math.min(count, pool.length) }, (_, index) => {
    const section = pool[index];
    const sentences = sentencesOf(section.text);
    const main = collectFacts(`[Section: ${section.heading}]\n${section.text}`)[0];
    const topic = main ? topicOf(main) : section.heading;
    const anchor = main?.sentence ?? sentences[0] ?? section.heading;
    return {
      title: `Case: ${section.heading}`,
      case_text: `Background: a group is working through a situation about ${section.heading}.\n\nObservations: ${sentences.join(" ")}\n\nComplication: an early decision ignored part of what is known about ${topic}.`,
      task: "Identify the problem, the evidence, the possible solutions and the best one, and justify your choice.",
      model: {
        problem: `The decision ignored ${topic}: ${anchor}`,
        evidence: sentences.slice(0, 3),
        solutions: [`Re-apply ${topic} correctly`, "Gather more observations before deciding"],
        best_solution: `Re-apply ${topic} correctly`,
        justification: `It follows the material: ${anchor}`,
      },
      concept: topic.slice(0, 60),
    };
  });
  return { cases };
}

const CASE_LABELS = { problem: "Problem", evidence: "Evidence", solutions: "Possible solutions", best_solution: "Best solution", justification: "Justification" } as const;
const CASE_WEIGHTS = { problem: 0.25, evidence: 0.15, solutions: 0.15, best_solution: 0.2, justification: 0.25 } as const;

export function caseEvaluationHeuristically(prompt: string) {
  const [expertPart, studentPart = ""] = prompt.split("Student analysis:");
  const read = (part: string, label: string) => part.match(new RegExp(`^${label}: (.*)$`, "m"))?.[1]?.trim() ?? "";
  const fields = Object.fromEntries(
    (Object.keys(CASE_LABELS) as Array<keyof typeof CASE_LABELS>).map((field) => {
      const expected = keywordsOf(read(expertPart, CASE_LABELS[field])).slice(0, 6);
      const given = read(studentPart, CASE_LABELS[field]);
      const blank = !given || given === "(blank)";
      const score = blank ? 0 : Math.round(pointCoverage(expected, given).ratio * 100);
      return [field, { score, feedback: blank ? "Left blank." : score >= 70 ? "Matches the expert analysis." : "Partly matches the expert analysis — compare the details." }];
    }),
  ) as Record<keyof typeof CASE_LABELS, { score: number; feedback: string }>;
  const overall = Math.round((Object.keys(CASE_WEIGHTS) as Array<keyof typeof CASE_WEIGHTS>).reduce((sum, field) => sum + fields[field].score * CASE_WEIGHTS[field], 0));
  const strong = (Object.keys(fields) as Array<keyof typeof CASE_LABELS>).filter((field) => fields[field].score >= 70).map((field) => CASE_LABELS[field]);
  const weak = (Object.keys(fields) as Array<keyof typeof CASE_LABELS>).filter((field) => fields[field].score < 70).map((field) => CASE_LABELS[field]);
  return {
    fields,
    overall,
    strengths: strong.map((label) => `${label} matches the expert analysis.`),
    gaps: weak.map((label) => `${label} needs more of the case's details.`),
    feedback: overall >= 80 ? "A complete, well-supported analysis." : `Strengthen: ${weak.join(", ") || "the details"}.`,
  };
}

// ---------------------------------------------------------------------------
// Guided reading (SQ3R / PQ4R)
// ---------------------------------------------------------------------------

function readingSections(material: string): Array<{ heading: string; text: string }> {
  const sections: Array<{ heading: string; text: string }> = [];
  for (const block of material.split(/^(?=\[Section \d+: )/m)) {
    const label = block.match(/^\[Section \d+: (.+)\]\n?/);
    if (!label) continue;
    sections.push({ heading: label[1].trim(), text: block.slice(label[0].length).trim() });
  }
  return sections;
}

export function readingAnswersHeuristically(material: string, prompt: string) {
  const sections = readingSections(material);
  const questions = [...prompt.matchAll(/^(\d+)\. \(Section (\d+)\) (.+)$/gm)].map((match) => ({ index: Number(match[1]), section: Number(match[2]) - 1, question: match[3] }));
  const answers = questions.map((entry) => {
    const sentences = sentencesOf(sections[entry.section]?.text ?? "");
    const keys = new Set(keywordsOf(entry.question));
    const related = sentences.filter((sentence) => keywordsOf(sentence).some((word) => keys.has(word)));
    const chosen = (related.length ? related : sentences).slice(0, 2);
    const answer = chosen.join(" ") || "The section does not say.";
    return { index: entry.index, covered: related.length > 0, model_answer: answer, key_points: keywordsOf(answer).slice(0, 3) };
  });
  return { answers };
}

export function reflectQuestionsHeuristically(material: string, prompt: string) {
  const count = Number(prompt.match(/Produce (?:exactly|up to) (\d+) questions/)?.[1] ?? "3");
  const transcript = readingSections(material).map((section) => `[Section: ${section.heading}]\n${section.text}`).join("\n\n");
  const facts = collectFacts(transcript);
  const kinds = ["why", "how", "what_if", "connect"] as const;
  const questions = facts.slice(0, count).map((fact, index) => {
    const topic = topicOf(fact);
    const kind = kinds[index % kinds.length];
    const promptText =
      kind === "why" ? `Why does ${topic} matter in ${fact.heading}?` : kind === "how" ? `How does ${topic} work, according to the material?` : kind === "what_if" ? `What would change if ${topic} did not happen?` : `How does ${topic} connect to the other ideas in ${fact.heading}?`;
    const answer = `${fact.sentence}${fact.next ? ` ${fact.next}` : ""}`;
    return { kind, prompt: promptText, model_answer: answer, key_points: keywordsOf(fact.sentence).slice(0, 3), concept: topic.slice(0, 60) };
  });
  return { questions };
}

// ---------------------------------------------------------------------------
// Dual coding
// ---------------------------------------------------------------------------

function shortLabel(sentence: string, words = 6): string {
  return sentence.split(/\s+/).slice(0, words).join(" ").replace(/[.,;:]$/, "");
}

/** Deterministic visual of one section; the kind rotates so a set mixes visual types. */
export function visualForSection(heading: string, body: string, kind: number) {
  const sentences = sentencesOf(body);
  const facts = collectFacts(`[Section: ${heading}]\n${body}`);
  const terms = facts.filter((fact) => fact.term).slice(0, 5);
  const years = sentences.filter((sentence) => /\b(1[5-9]\d\d|20\d\d)\b/.test(sentence));
  const order = ["table", "flowchart", "hierarchy", "relationships"] as const;
  let type: "table" | "flowchart" | "timeline" | "hierarchy" | "relationships" = years.length >= 2 ? "timeline" : order[kind % order.length];
  if (type === "table" && terms.length < 2) type = "flowchart";
  if (type === "relationships" && facts.length < 3) type = "hierarchy";
  if (type === "flowchart" && sentences.length < 2) type = "hierarchy";
  switch (type) {
    case "timeline":
      return { type, events: years.slice(0, 6).map((sentence) => ({ when: sentence.match(/\b(1[5-9]\d\d|20\d\d)\b/)![1], label: shortLabel(sentence), detail: sentence })) };
    case "table":
      return { type, columns: ["Term", "What the material says"], rows: terms.map((fact) => [fact.term!, (fact.definition ?? fact.sentence).replace(/[.]$/, "")]) };
    case "flowchart":
      return { type, steps: sentences.slice(0, 5).map((sentence) => ({ label: shortLabel(sentence), detail: sentence })) };
    case "relationships": {
      const nodes = facts.slice(0, 4).map((fact) => topicOf(fact));
      const relations = ["leads to", "requires", "contains"];
      return { type, nodes, links: nodes.slice(1).map((node, index) => ({ from: nodes[index], to: node, relation: relations[index % relations.length] })) };
    }
    default: {
      const keys = [...new Set(sentences.flatMap((sentence) => keywordsOf(sentence).slice(0, 2)))].slice(0, 6);
      return { type: "hierarchy" as const, root: heading, children: [{ label: keys[0] ?? heading, children: keys.slice(2, 4).map((key) => ({ label: key })) }, { label: keys[1] ?? "details", children: keys.slice(4, 6).map((key) => ({ label: key })) }] };
    }
  }
}

export function visualsHeuristically(transcript: string, prompt: string) {
  const count = Number(prompt.match(/Produce (?:exactly|up to) (\d+) topics/)?.[1] ?? "3");
  const sections = splitInlineSections(transcript);
  const topics = sections.slice(0, count).map((section, index) => {
    const sentences = sentencesOf(section.text);
    return { title: section.heading, concept: section.heading.slice(0, 60), text: sentences.slice(0, 3).join(" "), visual: visualForSection(section.heading, section.text, index) };
  });
  return { topics };
}

// ---------------------------------------------------------------------------
// Mind maps and concept maps
// ---------------------------------------------------------------------------

export function mindMapHeuristically(transcript: string, prompt: string) {
  const root = prompt.match(/^Material title:\s*(.+)$/m)?.[1]?.trim() || "Material";
  const sections = splitInlineSections(transcript).slice(0, 6);
  const used = new Set<string>([root.toLowerCase()]);
  const fresh = (value: string) => {
    const key = value.toLowerCase();
    if (used.has(key)) return null;
    used.add(key);
    return value;
  };
  const branches = sections.map((section) => {
    const facts = collectFacts(`[Section: ${section.heading}]\n${section.text}`);
    const children = facts
      .slice(0, 3)
      .map((fact) => {
        const name = fresh(topicOf(fact));
        if (!name) return null;
        const details = keywordsOf(fact.definition ?? fact.sentence)
          .filter((word) => !name.toLowerCase().includes(word))
          .slice(0, 2)
          .map((word) => fresh(word))
          .filter((word): word is string => Boolean(word));
        return { label: name, note: fact.sentence, children: details.map((word) => ({ label: word })) };
      })
      .filter((child): child is NonNullable<typeof child> => child !== null);
    return { label: fresh(section.heading) ?? `${section.heading} (part)`, note: sentencesOf(section.text)[0] ?? null, children };
  });
  const firsts = branches.map((branch) => branch.children[0]?.label).filter((value): value is string => Boolean(value));
  const links = firsts.length >= 2 ? [{ from: firsts[0], to: firsts[1], label: "related" }] : [];
  return { root, branches: branches.length >= 2 ? branches : [...branches, { label: "Key ideas", note: null, children: [] }], links };
}

export function conceptMapHeuristically(transcript: string) {
  const facts = collectFacts(transcript);
  const concepts = [...new Set(facts.map((fact) => topicOf(fact)))].slice(0, 8);
  const relations = ["leads_to", "requires", "contains", "depends_on", "causes", "is_example_of"] as const;
  const relationships = concepts.slice(1).map((concept, index) => ({ from: concepts[index], to: concept, relation: relations[index % relations.length], note: facts.find((fact) => topicOf(fact) === concepts[index])?.sentence ?? null }));
  return { concepts: concepts.length >= 2 ? concepts : [...concepts, "Main idea"], relationships: relationships.length ? relationships : [{ from: concepts[0] ?? "Material", to: "Main idea", relation: "contains" as const, note: null }] };
}

// ---------------------------------------------------------------------------
// Memory techniques
// ---------------------------------------------------------------------------

const ACROSTIC_WORDS: Record<string, string> = {
  A: "Always", B: "Bright", C: "Cats", D: "Dance", E: "Every", F: "Friday", G: "Gently", H: "Happily", I: "In", J: "July", K: "Kindly", L: "Lions", M: "Make",
  N: "New", O: "Orange", P: "Purple", Q: "Quiet", R: "Rabbits", S: "Sing", T: "Today", U: "Under", V: "Very", W: "Wild", X: "Xylophones", Y: "Yellow", Z: "Zebras",
};

function mnemonicOptionsFor(items: string[]) {
  const letters = items.map((item) => item.trim()[0]?.toUpperCase() ?? "?");
  const mapping = items.map((item, index) => `${letters[index]} = ${item}`).join(" · ");
  return [
    { kind: "acronym" as const, content: letters.join(""), explanation: mapping },
    { kind: "acrostic" as const, content: `${letters.map((letter) => ACROSTIC_WORDS[letter] ?? letter).join(" ")}.`, explanation: `Each word starts like the item in the same place: ${mapping}.` },
    {
      kind: "phrase" as const,
      content: `${items.map((item, index) => (index === 0 ? `First ${item}` : index === items.length - 1 ? `last ${item}` : `then ${item}`)).join(", ")} — ${items.length} in a row.`,
      explanation: "Say it in the same rhythm every time; each beat is one item, in order.",
    },
  ];
}

/** Lists worth a mnemonic: the material's topics in order, then the key ideas of each section. */
export function mnemonicsHeuristically(transcript: string, prompt: string) {
  const count = Number(prompt.match(/Produce (?:exactly|up to) (\d+) targets/)?.[1] ?? "3");
  const title = prompt.match(/^Material title:\s*(.+)$/m)?.[1]?.trim() || "the material";
  const sections = splitInlineSections(transcript);
  const candidates: Array<{ target: string; items: string[]; ordered: boolean; concept: string }> = [];
  if (sections.length >= 2) candidates.push({ target: `The main topics of ${title}, in order`, items: sections.slice(0, 8).map((section) => section.heading.slice(0, 120)), ordered: true, concept: title.slice(0, 60) });
  for (const section of sections) {
    const names = [...new Set(collectFacts(`[Section: ${section.heading}]\n${section.text}`).map((fact) => topicOf(fact)))].slice(0, 6);
    if (names.length >= 2) candidates.push({ target: `The key ideas of ${section.heading}`, items: names, ordered: false, concept: section.heading.slice(0, 60) });
  }
  if (candidates.length === 0) {
    const words = keywordsOf(transcript).slice(0, 4);
    candidates.push({ target: `Key words of ${title}`, items: words.length >= 2 ? words : ["main idea", "details"], ordered: false, concept: title.slice(0, 60) });
  }
  return { targets: candidates.slice(0, Math.max(1, count)).map((candidate) => ({ ...candidate, options: mnemonicOptionsFor(candidate.items) })) };
}

/** Memory palace: one image per "index. Location: … — Concept: … — Meaning: …" line. */
export function associationsHeuristically(prompt: string) {
  const associations = [...prompt.matchAll(/^(\d+)\. Location: (.+?) — Concept: (.+?) — Meaning: (.+)$/gm)].map((match) => ({
    index: Number(match[1]),
    association: `At the ${match[2].trim().toLowerCase()}, a giant glowing sign reading "${match[3].trim()}" blocks your way; touching it reminds you that ${match[4].trim().replace(/[.]$/, "")}.`,
  }));
  return { associations };
}

const STORY_HEROES = ["Mira", "Tomas", "Ana"];

/** Story method: one story per section, each sentence of the section a fact carried by its own paragraph. */
export function storiesHeuristically(transcript: string, prompt: string) {
  const count = Number(prompt.match(/Produce (?:exactly|up to) (\d+) stories/)?.[1] ?? "2");
  const groups = splitInlineSections(transcript)
    .map((section) => ({ heading: section.heading, facts: sentencesOf(section.text).slice(0, 6) }))
    .filter((group) => group.facts.length >= 2);
  const fallback = sentencesOf(transcript).slice(0, 6);
  const chosen = groups.length ? groups.slice(0, Math.max(1, count)) : [{ heading: "the material", facts: fallback.length >= 2 ? fallback : [...fallback, "The material says more than this."] }];
  const stories = chosen.map((group, storyIndex) => {
    const hero = STORY_HEROES[storyIndex % STORY_HEROES.length];
    return {
      title: `${hero} and the ${group.heading}`,
      concept: group.heading.slice(0, 60),
      facts: group.facts,
      paragraphs: group.facts.map((fact, index) => ({
        text: `${index === 0 ? `${hero} stepped through a door marked "${group.heading}".` : index === group.facts.length - 1 ? "At the end of the path," : "Further along,"} A guide in a lab coat told ${hero}: "${fact}"`,
        facts: [index + 1],
      })),
      accuracy_note: null,
    };
  });
  return { stories };
}

/** Retell check: a fact counts as recalled when most of its key words come back. */
export function retellCheckHeuristically(prompt: string) {
  const facts = [...(prompt.match(/Facts:\n([\s\S]*?)\nRetelling:/)?.[1] ?? "").matchAll(/^(\d+)\. (.+)$/gm)].map((match) => ({ index: Number(match[1]), text: match[2] }));
  const retell = (prompt.match(/Retelling:\n"""\n([\s\S]*?)\n"""/)?.[1] ?? "").trim();
  const blank = retell.length < 3 || retell === "(blank)";
  const lower = retell.toLowerCase();
  const marks = facts.map((fact) => {
    const words = keywordsOf(fact.text);
    const present = words.filter((word) => lower.includes(word)).length;
    return { index: fact.index, recalled: !blank && words.length > 0 && present / words.length >= 0.5 };
  });
  const recalled = marks.filter((mark) => mark.recalled).length;
  const contradiction = !blank && /\bnot\b/i.test(retell) && !facts.some((fact) => /\bnot\b/i.test(fact.text));
  return {
    facts: marks,
    incorrect: contradiction ? ["Your retelling negates something the notes state."] : [],
    feedback: blank ? "Nothing written yet — retell whatever you remember of the story, even a few words." : recalled === facts.length ? "Every fact made it into your retelling." : `You kept ${recalled} of ${facts.length} facts. Picture the scenes you skipped and retell them next time.`,
  };
}
