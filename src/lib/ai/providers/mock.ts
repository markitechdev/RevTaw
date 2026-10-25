import { associationsHeuristically, caseEvaluationHeuristically, casesHeuristically, conceptMapHeuristically, mindMapHeuristically, mnemonicsHeuristically, problemEvaluationHeuristically, problemsHeuristically, readingAnswersHeuristically, reflectQuestionsHeuristically, retellCheckHeuristically, scenarioEvaluationHeuristically, scenariosHeuristically, storiesHeuristically, visualForSection, visualsHeuristically } from "@/lib/ai/providers/mock-study";
import { collectFacts, isHeadingLike, keywordsOf, overlap, parseTranscriptSections, sentencesOf, splitInlineSections } from "@/lib/ai/providers/mock-text";
import type { AiGenerateOptions, AiGenerateResult, AiProvider } from "@/lib/ai/types";

export { parseTranscriptSections } from "@/lib/ai/providers/mock-text";

/**
 * Deterministic stand-in used in development and automated tests when no AI
 * key is configured. It derives a plausible structured analysis from the
 * material text with simple heuristics so the whole pipeline (extraction →
 * analysis → viewer) can be exercised without network access.
 *
 * Never enabled in production unless AI_PROVIDER=mock is set explicitly.
 */
export class MockProvider implements AiProvider {
  readonly name = "mock";
  readonly model = "mock-heuristics-1";
  readonly supportsVision = true;

  async generate(options: AiGenerateOptions): Promise<AiGenerateResult> {
    const userText = lastUserText(options);
    const rawMaterial = extractTag(userText, "material") ?? userText;
    // Drop the transcript's bracketed section labels so they don't leak into "facts".
    const material = rawMaterial.replace(/^\[(?:Section|Not included)[^\]]*\]\s*$/gm, "");
    const task = options.task ?? inferTask(options);

    let text: string;
    switch (task) {
      case "analyze_material":
        text = JSON.stringify(analyzeHeuristically(material));
        break;
      case "generate_reviewer":
        text = JSON.stringify(reviewerHeuristically(rawMaterial, `${options.system ?? ""}\n${userText}`));
        break;
      case "regenerate_section":
        text = JSON.stringify(sectionHeuristically(userText));
        break;
      case "generate_quiz":
        text = JSON.stringify(quizHeuristically(rawMaterial, `${options.system ?? ""}\n${userText}`));
        break;
      case "grade_answers":
        text = JSON.stringify(gradeHeuristically(userText));
        break;
      case "generate_flashcards":
        text = JSON.stringify(flashcardsHeuristically(rawMaterial, userText));
        break;
      case "recall_questions":
        text = JSON.stringify(recallQuestionsHeuristically(rawMaterial, userText));
        break;
      case "recall_compare":
        text = JSON.stringify(recallCompareHeuristically(userText));
        break;
      case "feynman_concepts":
        text = JSON.stringify(feynmanConceptsHeuristically(rawMaterial, userText));
        break;
      case "feynman_analyze":
        text = JSON.stringify(feynmanAnalysisHeuristically(userText));
        break;
      case "tutor_reply": {
        const previous = [...options.messages].reverse().find((message) => message.role === "assistant");
        const previousText = previous ? (typeof previous.content === "string" ? previous.content : previous.content.map((part) => (part.type === "text" ? part.text : "")).join(" ")) : "";
        text = JSON.stringify(tutorReplyHeuristically(rawMaterial, userText, options.system ?? "", previousText));
        break;
      }
      case "tutor_evaluate":
        text = JSON.stringify(tutorEvaluationHeuristically(userText));
        break;
      case "blurting_compare":
        text = JSON.stringify(blurtCompareHeuristically(userText));
        break;
      case "chunk_material":
        text = JSON.stringify(chunkHeuristically(rawMaterial, userText));
        break;
      case "question_evaluate":
        text = JSON.stringify(questionEvaluationHeuristically(rawMaterial, userText));
        break;
      case "generate_problems":
        text = JSON.stringify(problemsHeuristically(rawMaterial, `${options.system ?? ""}\n${userText}`));
        break;
      case "problem_evaluate":
        text = JSON.stringify(problemEvaluationHeuristically(userText));
        break;
      case "generate_scenarios":
        text = JSON.stringify(scenariosHeuristically(rawMaterial, userText));
        break;
      case "scenario_evaluate":
        text = JSON.stringify(scenarioEvaluationHeuristically(userText));
        break;
      case "generate_cases":
        text = JSON.stringify(casesHeuristically(rawMaterial, userText));
        break;
      case "case_evaluate":
        text = JSON.stringify(caseEvaluationHeuristically(userText));
        break;
      case "reading_answers":
        text = JSON.stringify(readingAnswersHeuristically(rawMaterial, userText));
        break;
      case "reflect_questions":
        text = JSON.stringify(reflectQuestionsHeuristically(rawMaterial, userText));
        break;
      case "generate_visuals":
        text = JSON.stringify(visualsHeuristically(rawMaterial, userText));
        break;
      case "generate_mind_map":
        text = JSON.stringify(mindMapHeuristically(rawMaterial, userText));
        break;
      case "generate_concept_map":
        text = JSON.stringify(conceptMapHeuristically(rawMaterial));
        break;
      case "generate_mnemonics":
        text = JSON.stringify(mnemonicsHeuristically(rawMaterial, userText));
        break;
      case "palace_associations":
        text = JSON.stringify(associationsHeuristically(userText));
        break;
      case "generate_stories":
        text = JSON.stringify(storiesHeuristically(rawMaterial, userText));
        break;
      case "story_retell_check":
        text = JSON.stringify(retellCheckHeuristically(userText));
        break;
      case "ocr_image":
        text = "Mock transcription: the image was read by the mock provider. Configure a real AI provider to extract the actual text.";
        break;
      default:
        text = options.json
          ? JSON.stringify({ note: "mock provider", task })
          : `Mock response for task "${task}".`;
    }

    return {
      text,
      usage: { inputTokens: Math.ceil(userText.length / 4), outputTokens: Math.ceil(text.length / 4) },
      provider: this.name,
      model: this.model,
      stopReason: "end_turn",
    };
  }
}

function lastUserText(options: AiGenerateOptions): string {
  const last = [...options.messages].reverse().find((message) => message.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  return last.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function extractTag(text: string, tag: string): string | null {
  // Tamari's sections can carry attributes (<material title="…">).
  const match = text.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : null;
}

function inferTask(options: AiGenerateOptions): string {
  const system = options.system ?? "";
  if (/analy[sz]e/i.test(system)) return "analyze_material";
  if (/transcribe|ocr/i.test(system)) return "ocr_image";
  return "generic";
}

const STUDY_METHOD_SETS = {
  definitions: ["flashcards", "active_recall", "spaced_repetition"],
  concepts: ["feynman", "socratic_questioning", "self_explanation"],
  math: ["worked_examples", "faded_worked_examples", "practice_problems", "error_review"],
  broad: ["interleaving", "practice_testing", "spaced_repetition"],
} as const;

export function analyzeHeuristically(material: string) {
  const lines = material
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sentences = material
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20);
  const words = material.split(/\s+/).filter(Boolean);

  const headings = lines
    .filter(
      (line) =>
        line.length <= 80 &&
        !/[.!?:;,]$/.test(line) &&
        (/^(chapter|unit|lesson|section|part|topic)\b/i.test(line) ||
          /^\d+(\.\d+)*\s+\S/.test(line) ||
          line === line.toUpperCase() ||
          /^(?:[A-Z][\w'-]*\s*){1,6}$/.test(line)),
    )
    .map((line) => line.replace(/^\d+(\.\d+)*\s+/, ""))
    .filter((line, index, all) => all.indexOf(line) === index)
    .slice(0, 8);

  const definitions = sentences
    .map((sentence) => sentence.match(/^((?:[A-Z][\w'-]*|[a-z][\w'-]*)(?:\s+[\w'-]+){0,4})\s+(?:is|are|refers to|means|is defined as)\s+(.+?)[.!?]?$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ term: match[1].trim(), definition: match[2].trim() }))
    .filter((item, index, all) => all.findIndex((other) => other.term.toLowerCase() === item.term.toLowerCase()) === index)
    .slice(0, 10);

  const formulas = lines
    .filter((line) => /[=]/.test(line) && /[A-Za-z]/.test(line) && line.length <= 120 && !/https?:/.test(line))
    .slice(0, 6)
    .map((line) => ({ expression: line, meaning: "Appears in the material as written." }));

  const facts = sentences
    .filter((sentence) => /\d/.test(sentence) || /\b(always|never|must|important|key)\b/i.test(sentence))
    .slice(0, 6);

  const termCounts = new Map<string, number>();
  for (const word of words) {
    const clean = word.replace(/[^\w-]/g, "");
    if (clean.length > 3 && /^[A-Z][a-z]+/.test(clean)) {
      termCounts.set(clean, (termCounts.get(clean) ?? 0) + 1);
    }
  }
  const categories = ["understanding", "memorization", "application", "calculation"] as const;
  const keyConcepts = [...termCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name], index) => ({
      name,
      explanation: `Mentioned ${termCounts.get(name)} time${termCounts.get(name) === 1 ? "" : "s"} in the material.`,
      category: categories[index % categories.length],
    }));

  const topics = (headings.length > 0 ? headings : keyConcepts.slice(0, 4).map((concept) => concept.name)).map(
    (title) => ({ title, description: `Section of the material about ${title.toLowerCase()}.` }),
  );

  const averageSentence = sentences.length ? words.length / sentences.length : 12;
  const difficulty = averageSentence > 24 || formulas.length > 2 ? "advanced" : averageSentence > 16 ? "intermediate" : "beginner";
  const estimatedMinutes = Math.max(10, Math.min(600, Math.round(words.length / 110) * 5 + 10));

  const methods =
    formulas.length >= 2
      ? STUDY_METHOD_SETS.math
      : definitions.length >= 4
        ? STUDY_METHOD_SETS.definitions
        : topics.length >= 6
          ? STUDY_METHOD_SETS.broad
          : STUDY_METHOD_SETS.concepts;

  return {
    summary:
      sentences.slice(0, 2).join(" ").slice(0, 400) ||
      "The material is short; add more content for a richer analysis.",
    main_topics: topics.length ? topics : [{ title: "General notes", description: "The material does not have clear headings." }],
    key_concepts: keyConcepts,
    definitions,
    formulas,
    important_facts: facts,
    exam_topics: topics.slice(0, 4).map((topic) => ({ topic: topic.title, why: "Appears as a major heading in the material." })),
    difficulty,
    estimated_study_minutes: estimatedMinutes,
    recommended_methods: methods.map((method) => ({
      method,
      reason:
        method === "flashcards" || method === "active_recall" || method === "spaced_repetition"
          ? "The material is definition-heavy, so retrieval practice works best."
          : method === "worked_examples" || method === "practice_problems" || method === "faded_worked_examples" || method === "error_review"
            ? "The material contains formulas, so practicing problems builds fluency."
            : method === "interleaving" || method === "practice_testing"
              ? "The material covers many topics, so mixing them prepares you for exams."
              : "The material is concept-heavy, so explaining ideas in your own words deepens understanding.",
    })),
    language: "en",
  };
}

/** Deterministic reviewer: one section per transcript section, kind-aware. */
export function reviewerHeuristically(transcript: string, prompt: string) {
  const sections = parseTranscriptSections(transcript);
  const titleMatch = prompt.match(/Material title:\s*(.+)/);
  const materialTitle = titleMatch ? titleMatch[1].trim() : "Material";
  const kindMatch = prompt.match(/into a "([^"]+)"/) ?? prompt.match(/a "([^"]+)" \(/);
  const kindName = kindMatch ? kindMatch[1] : "Reviewer";
  const analysis = analyzeHeuristically(sections.map((section) => section.text).join("\n"));

  if (/Cue Column/.test(prompt)) {
    return {
      title: `${materialTitle} — Cornell Notes`,
      sections: [
        { heading: "Cue Column", content: sections.map((section) => `- What is covered in "${section.heading}"?`).join("\n") },
        {
          heading: "Main Notes",
          content: sections.map((section) => `**${section.heading}**\n${sentencesOf(section.text).slice(0, 4).map((line) => `- ${line}`).join("\n")}`).join("\n\n"),
        },
        { heading: "Summary", content: sentencesOf(sections.map((section) => section.text).join(" ")).slice(0, 3).join(" ") },
      ],
    };
  }

  if (/Q&A/.test(kindName)) {
    return {
      title: `${materialTitle} — Q&A`,
      sections: sections.map((section) => ({
        heading: section.heading,
        content: sentencesOf(section.text)
          .slice(0, 4)
          .map((sentence) => `**Q:** What does the material say about this: "${sentence.split(" ").slice(0, 6).join(" ")}…"?\n**A:** ${sentence}`)
          .join("\n\n"),
      })),
    };
  }

  if (/Definitions/.test(kindName)) {
    const items = analysis.definitions.map((item) => `- **${item.term}** — ${item.definition}`);
    return {
      title: `${materialTitle} — Definitions`,
      sections: [{ heading: "Glossary", content: items.length ? items.join("\n") : "The material does not state explicit definitions." }],
    };
  }

  return {
    title: `${materialTitle} — ${kindName}`,
    sections: sections.map((section) => ({
      heading: section.heading,
      content:
        sentencesOf(section.text)
          .slice(0, 6)
          .map((sentence) => `- ${sentence}`)
          .join("\n") + `\n\n**Remember:** ${sentencesOf(section.text)[0] ?? section.heading}`,
    })),
  };
}

export function sectionHeuristically(prompt: string) {
  const heading = prompt.match(/Heading:\s*(.+)/)?.[1]?.trim() ?? "Section";
  const instructions = prompt.match(/Student's instructions:\s*(.+)/)?.[1]?.trim() ?? "";
  const current = prompt.match(/Current content:\n([\s\S]*?)\n\n(?:Student's instructions|JSON schema)/)?.[1]?.trim() ?? "";
  const shorter = /short/i.test(instructions);
  const lines = current.split("\n").filter(Boolean);
  return {
    heading,
    content: `${shorter ? lines.slice(0, 2).join("\n") : lines.join("\n")}\n\n_Revised by the mock provider${instructions ? ` (${instructions})` : ""}._`,
  };
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

function negate(sentence: string): string {
  const negated = sentence.replace(/\b(is|are|was|were|can|does|do|has|have|will)\b(?! not)/, "$1 not");
  return negated === sentence ? `It is false that ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}` : negated;
}

/** Deterministic quiz: cycles through the material's facts per requested type. */
export function quizHeuristically(transcript: string, prompt: string) {
  const materialTitle = prompt.match(/Material title:\s*(.+)/)?.[1]?.trim() ?? "Material";
  const plan = [...prompt.matchAll(/^- ([a-z_]+): (\d+)$/gm)].map((match) => ({ type: match[1], count: Number(match[2]) }));
  const fixedDifficulty = prompt.match(/"(easy|medium|hard)" for every question/)?.[1] ?? null;
  // Adaptive mode (Phase 6): honour the per-concept targets and the focus list from the prompt.
  const conceptKey = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/s$/, "");
  const targets = new Map<string, "easy" | "medium" | "hard">();
  const targetLine = prompt.match(/per-concept targets[^:]*:\s*(.+?);\s*concepts without a target: medium/)?.[1];
  for (const pair of targetLine?.split(";") ?? []) {
    const match = pair.trim().match(/^(.+?):\s*(easy|medium|hard|advanced)$/);
    if (match) targets.set(conceptKey(match[1]), match[2] === "advanced" ? "hard" : (match[2] as "easy" | "medium" | "hard"));
  }
  const focusLine = prompt.match(/concepts the student struggles with:\s*(.+?);\s*cover the rest/)?.[1];
  const focus = new Set((focusLine?.split(",") ?? []).map((name) => conceptKey(name)).filter(Boolean));
  const allFacts = collectFacts(transcript);
  const facts = focus.size ? [...allFacts.filter((fact) => fact.term && focus.has(conceptKey(fact.term))), ...allFacts.filter((fact) => !(fact.term && focus.has(conceptKey(fact.term))))] : allFacts;
  const terms = [...new Set(facts.map((fact) => fact.term).filter((term): term is string => Boolean(term)))];
  const difficulties = ["easy", "medium", "hard"] as const;
  const questions: Array<Record<string, unknown>> = [];
  let cursor = 0;

  if (facts.length === 0) return { title: `${materialTitle} — Quiz`, questions };

  for (const item of plan) {
    for (let index = 0; index < item.count; index += 1) {
      const fact = facts[cursor % facts.length];
      const serial = cursor;
      cursor += 1;
      const topic = fact.term ?? fact.heading;
      const base = {
        difficulty: fixedDifficulty ?? (targets.size ? (targets.get(conceptKey(topic)) ?? "medium") : difficulties[serial % 3]),
        explanation: `The material states: "${fact.sentence}"`,
        concept: topic.slice(0, 60),
        source_excerpt: fact.sentence.slice(0, 300),
      };
      switch (item.type) {
        case "multiple_choice": {
          const distractors = fact.term
            ? terms.filter((term) => term !== fact.term).slice(0, 3)
            : facts.filter((other) => other !== fact).slice(0, 3).map((other) => negate(other.sentence));
          while (distractors.length < 3) distractors.push(`Not stated in the material (${distractors.length + 1})`);
          const texts = [fact.term ?? fact.sentence, ...distractors];
          const rotated = texts.map((_, position) => texts[(position + serial) % texts.length]);
          const ids = ["a", "b", "c", "d"];
          questions.push({
            type: "multiple_choice",
            ...base,
            prompt: fact.term ? `Which term is described here: "${fact.definition}"?` : "Which of these statements is supported by the material?",
            options: rotated.map((text, position) => ({ id: ids[position], text })),
            answer: { option_id: ids[rotated.indexOf(fact.term ?? fact.sentence)] },
          });
          break;
        }
        case "true_false": {
          const truthy = serial % 2 === 0;
          questions.push({
            type: "true_false",
            ...base,
            prompt: truthy ? fact.sentence : negate(fact.sentence),
            answer: { value: truthy },
          });
          break;
        }
        case "identification": {
          const term = fact.term ?? fact.heading;
          questions.push({
            type: "identification",
            ...base,
            prompt: fact.term ? `Identify the term: ${fact.definition}.` : `Which part of the material covers this: "${fact.sentence}"?`,
            answer: { accepted: [term, `the ${term}`] },
          });
          break;
        }
        case "fill_blank": {
          const words = fact.sentence.split(" ");
          const target = fact.term && fact.sentence.includes(fact.term) ? fact.term : [...words].sort((a, b) => b.length - a.length)[0].replace(/[.,;:]$/, "");
          questions.push({
            type: "fill_blank",
            ...base,
            prompt: fact.sentence.replace(target, "____"),
            answer: { accepted: [target] },
          });
          break;
        }
        case "short_answer":
          questions.push({
            type: "short_answer",
            ...base,
            prompt: fact.term ? `In your own words, what is ${topic}?` : `Summarize this point from "${fact.heading}": ${fact.sentence.split(" ").slice(0, 6).join(" ")}…`,
            answer: { model_answer: fact.sentence, rubric: keywordsOf(fact.definition ?? fact.sentence).slice(0, 3).map((word) => `Mentions ${word}`) },
          });
          break;
        default:
          questions.push({
            type: item.type,
            ...base,
            prompt:
              item.type === "essay"
                ? `Explain ${topic} and why it matters, using only the material.`
                : item.type === "scenario"
                  ? `A classmate has to apply ${topic} in a real situation. Using the material, explain what they should do and why.`
                  : item.type === "case_based"
                    ? `Case: a student claims that "${negate(fact.sentence)}" Evaluate the claim using the material.`
                    : `Work through this step by step using the material: how would you apply ${topic}? State your final answer.`,
            answer: {
              model_answer: [fact.sentence, fact.next].filter(Boolean).join(" "),
              rubric: keywordsOf(fact.sentence).slice(0, 3).map((word) => `Mentions ${word}`),
            },
          });
      }
    }
  }

  return { title: `${materialTitle} — ${plan.length > 1 ? "Mixed" : "Practice"} Quiz`, questions };
}

/** Deterministic grader: keyword overlap between the student's answer and the model answer/rubric. */
export function gradeHeuristically(prompt: string) {
  const blocks = prompt.split(/\n\n(?=Answer \d+\n)/);
  const grades = blocks
    .map((block) => {
      const id = block.match(/^id:\s*(.+)$/m)?.[1]?.trim();
      const points = Number(block.match(/^max points:\s*(\d+)$/m)?.[1] ?? "1");
      const model = block.match(/^model answer:\s*(.+)$/m)?.[1] ?? "";
      const rubric = block.match(/^rubric:\s*([\s\S]*?)\nstudent answer:/m)?.[1] ?? "";
      const student = block.match(/^student answer:\s*([\s\S]*)$/m)?.[1]?.trim() ?? "";
      if (!id) return null;
      const expected = keywordsOf(`${model} ${rubric.replace(/Mentions /g, "")}`);
      const given = new Set(keywordsOf(student));
      const hits = expected.filter((word) => given.has(word));
      const ratio = expected.length ? hits.length / expected.length : 0;
      const score = student.length < 3 ? 0 : Math.max(ratio >= 0.5 ? 1 : 0, Math.round(points * Math.min(1, ratio * 1.5)));
      const feedback =
        score >= points
          ? `Good — you covered the key ideas (${hits.slice(0, 3).join(", ")}).`
          : score > 0
            ? `Partly there: you mentioned ${hits.slice(0, 2).join(", ") || "some points"}, but the model answer also expects ${expected.filter((word) => !given.has(word)).slice(0, 2).join(", ")}.`
            : `This does not yet match the material. Re-read the source and look for: ${expected.slice(0, 3).join(", ")}.`;
      return { id, score, feedback };
    })
    .filter((grade): grade is { id: string; score: number; feedback: string } => Boolean(grade));
  return { grades };
}

// ---------------------------------------------------------------------------
// Flashcards
// ---------------------------------------------------------------------------

/** Deterministic flashcards: definitions as term → definition, then question and cloze cards from sentences. */
export function flashcardsHeuristically(transcript: string, prompt: string) {
  const materialTitle = prompt.match(/Material title:\s*(.+)/)?.[1]?.trim() ?? "Material";
  const count = Number(prompt.match(/Produce exactly (\d+) cards/)?.[1] ?? "20");
  const facts = collectFacts(transcript);
  const cards: Array<{ front: string; back: string; hint: string | null; concept: string; source_excerpt: string }> = [];
  // Pass 0 writes one card per fact; later passes add a second style for the same facts.
  for (let pass = 0; pass < 3 && cards.length < count && facts.length > 0; pass += 1) {
    facts.forEach((fact, index) => {
      if (cards.length >= count) return;
      const concept = (fact.term ?? fact.heading).slice(0, 60);
      const excerpt = fact.sentence.slice(0, 300);
      const words = fact.sentence.split(" ");
      const longest = [...words].sort((a, b) => b.length - a.length).map((word) => word.replace(/[.,;:]$/, ""));
      const target = longest[Math.min(pass, longest.length - 1)];
      if (pass === 0 && fact.term && fact.definition) {
        cards.push({ front: fact.term, back: fact.definition.charAt(0).toUpperCase() + fact.definition.slice(1) + ".", hint: `Defined under "${fact.heading}".`, concept, source_excerpt: excerpt });
      } else if (pass === 1 && fact.term && fact.definition) {
        cards.push({ front: `What is ${fact.term}?`, back: fact.definition.charAt(0).toUpperCase() + fact.definition.slice(1) + ".", hint: null, concept, source_excerpt: excerpt });
      } else if ((index + pass) % 2 === 0 && target.length > 4 && fact.sentence.includes(target)) {
        cards.push({ front: fact.sentence.replace(target, "____"), back: target, hint: null, concept, source_excerpt: excerpt });
      } else {
        cards.push({ front: `According to "${fact.heading}", what is stated about ${words.slice(0, 3).join(" ").replace(/[.,;:]$/, "")}…?`, back: fact.sentence, hint: null, concept, source_excerpt: excerpt });
      }
    });
  }
  return { title: `${materialTitle} — Flashcards`, cards };
}

// ---------------------------------------------------------------------------
// Study sessions: active recall and Feynman
// ---------------------------------------------------------------------------

/** Deterministic recall prompts: definitions first, then "what does the material say" prompts. */
export function recallQuestionsHeuristically(transcript: string, prompt: string) {
  const count = Number(prompt.match(/Produce exactly (\d+) prompts/)?.[1] ?? "5");
  const focus = (prompt.match(/Focus concepts[^:]*:\s*(.+)/)?.[1] ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  const formats = (prompt.match(/^Formats to rotate:\s*(.+)$/m)?.[1] ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const facts = collectFacts(transcript);
  const ordered = [...facts].sort((a, b) => Number(focus.includes((b.term ?? b.heading).toLowerCase())) - Number(focus.includes((a.term ?? a.heading).toLowerCase())));
  const questions = ordered.slice(0, count).map((fact, index) => {
    const format = formats.length ? formats[index % formats.length] : null;
    const topic = fact.term ?? fact.sentence.split(" ").slice(0, 4).join(" ").replace(/[.,;:]$/, "");
    let promptText = fact.term ? `From memory: what is ${fact.term}?` : `From memory: what does the material say about ${topic}…?`;
    let modelAnswer = fact.sentence;
    if (format === "fill_blank" && fact.term) {
      promptText = `Fill in the blank: ${fact.sentence.replace(new RegExp(fact.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "____")}`;
      modelAnswer = fact.term;
    } else if (format === "definition" && fact.term) promptText = `Define ${fact.term} as the material does.`;
    else if (format === "explanation") promptText = `Explain in your own words: ${fact.term ? `why does ${fact.term} matter and how does it work?` : `what is happening in "${topic}…" and why?`}`;
    else if (format === "list") promptText = `List what the material says about ${topic}.`;
    else if (format === "example") promptText = `Give an example that fits what the material says about ${topic}.`;
    else if (format === "process") promptText = `Describe, in order, the process the material connects with ${topic}.`;
    else if (format === "calculation") promptText = `Work through it: apply what the material states about ${topic} to a concrete case.`;
    return {
      prompt: promptText,
      model_answer: modelAnswer,
      key_points: format === "fill_blank" && fact.term ? [fact.term] : keywordsOf(fact.definition ?? fact.sentence).slice(0, 4),
      concept: (fact.term ?? fact.heading).slice(0, 60),
      source_excerpt: fact.sentence.slice(0, 300),
      ...(format ? { format } : {}),
    };
  });
  return { questions };
}

/** Deterministic blurting check: which key terms of the source appear in the blurt. */
export function blurtCompareHeuristically(prompt: string) {
  const source = prompt.match(/Source:\n"""\n([\s\S]*?)\n"""/)?.[1] ?? "";
  const student = prompt.match(/Student blurt \(attempt \d+\):\n"""\n([\s\S]*?)\n"""/)?.[1]?.trim() ?? "";
  const keyBlock = prompt.match(/Key points:\n([\s\S]*?)\nSource:/)?.[1] ?? "";
  const keyPoints = [...keyBlock.matchAll(/^- (.+)$/gm)].map((match) => match[1].trim()).filter((point) => !/^\(derive/.test(point));
  const sentences = sentencesOf(source);
  const terms = keyPoints.length ? keyPoints : [...new Set(sentences.flatMap((sentence) => keywordsOf(sentence).slice(0, 2)))].slice(0, 8);
  const blank = student.length < 3 || /^\(blank\)$/.test(student);
  const lower = student.toLowerCase();
  const remembered = blank ? [] : terms.filter((term) => lower.includes(term.toLowerCase()));
  const missing = terms.filter((term) => !remembered.includes(term));
  const definitions = sentences.filter((sentence) => /\b(?:is|are|refers to|means)\b/.test(sentence)).map((sentence) => keywordsOf(sentence)[0]).filter(Boolean);
  const forgotten = missing.filter((term) => definitions.includes(term.toLowerCase()) || /^[A-Z]/.test(term)).slice(0, 5);
  const contradiction = !blank && /\bnot\b/i.test(student) && !/\bnot\b/i.test(source);
  const score = blank ? 0 : Math.max(0, Math.round((remembered.length / Math.max(1, terms.length)) * 100) - (contradiction ? 20 : 0));
  return {
    remembered,
    missing,
    incorrect: contradiction ? ["Your text negates something the section states."] : [],
    forgotten_important: forgotten,
    score,
    feedback: blank ? "Nothing written yet — write whatever you remember, even single words." : score >= 80 ? `Strong recall: you covered ${remembered.slice(0, 3).join(", ")}.` : `You remembered ${remembered.length} of ${terms.length} key ideas. Think about ${missing.slice(0, 2).join(" and ") || "the main definitions"} before you retry.`,
  };
}

/** Deterministic chunking: one chunk per transcript section. */
export function chunkHeuristically(transcript: string, prompt: string) {
  const count = Number(prompt.match(/Produce about (\d+) chunks/)?.[1] ?? "4");
  // Split each transcript section again at inline headings, so short notes still give several chunks.
  const sections = splitInlineSections(transcript);
  const chunks = sections.slice(0, Math.max(1, count)).map((section) => {
    const sentences = sentencesOf(section.text);
    const facts = collectFacts(`[Section: ${section.heading}]\n${section.text}`);
    const fact = facts.find((item) => item.term) ?? facts[0];
    const topic = fact?.term ?? section.heading;
    return {
      title: section.heading,
      main_idea: sentences[0],
      details: sentences.slice(1, 5),
      mini_summary: `${section.heading}: ${sentences[0].slice(0, 160)}`,
      recall_question: fact?.term ? `From memory: what is ${fact.term}?` : `From memory: what is the main point of "${section.heading}"?`,
      model_answer: fact?.sentence ?? sentences[0],
      key_points: keywordsOf(fact?.definition ?? fact?.sentence ?? sentences[0]).slice(0, 4),
      concept: topic.slice(0, 60),
    };
  });
  return { chunks };
}

/** Deterministic question evaluation: keyword overlap with the material and simple wording checks. */
export function questionEvaluationHeuristically(material: string, prompt: string) {
  const question = prompt.match(/^Student's question:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const expected = prompt.match(/^Expected answer:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const passages = parsePassages(material);
  const sentences = passages.flatMap((passage) => passage.sentences);
  const terms = keywordsOf(question);
  const scored = sentences.map((sentence) => ({ sentence, score: keywordsOf(sentence).filter((word) => terms.includes(word)).length })).sort((a, b) => b.score - a.score);
  const best = scored[0];
  const relevance = best && best.score > 0 ? Math.min(100, 50 + best.score * 20) : 15;
  const clarity = Math.max(20, Math.min(100, (/\?$/.test(question) ? 60 : 40) + (question.split(" ").length >= 6 ? 20 : 0) + (/\b(what|why|how|which|when|where|explain|describe|compare)\b/i.test(question) ? 20 : 0)));
  const noAnswer = !expected || /^\(not given\)$/.test(expected);
  const covered = Boolean(best && best.score > 0);
  const expectedTerms = keywordsOf(expected);
  const sourceTerms = covered ? keywordsOf(best!.sentence) : [];
  const accuracy = noAnswer ? (covered ? 100 : 40) : covered && expectedTerms.length ? Math.round((expectedTerms.filter((term) => sourceTerms.includes(term)).length / expectedTerms.length) * 100) : 30;
  const difficulty = /\b(why|how|compare|evaluate|explain)\b/i.test(question) ? "hard" : question.split(" ").length > 10 ? "medium" : "easy";
  const overall = Math.round(relevance * 0.4 + clarity * 0.25 + accuracy * 0.35);
  return {
    relevance,
    clarity,
    accuracy,
    difficulty,
    overall,
    feedback: relevance < 50 ? "The material does not seem to cover this; anchor the question in a definition or process it states." : clarity < 70 ? "Good topic — make the wording more specific so there is exactly one defensible answer." : "Clear, relevant question that an examiner could ask.",
    improved_question: covered && !/^according to the material/i.test(question) ? `According to the material, ${question.charAt(0).toLowerCase()}${question.slice(1).replace(/\?$/, "")}?` : question,
    model_answer: covered ? best!.sentence : "Not covered by the material.",
    concept: (covered ? keywordsOf(best!.sentence)[0] : null) ?? "general",
  };
}

/** Deterministic recall check: key-point overlap decides verdict and score. */
export function recallCompareHeuristically(prompt: string) {
  const model = prompt.match(/^Model answer:\s*(.+)$/m)?.[1] ?? "";
  const keyPoints = [...prompt.matchAll(/^- (.+)$/gm)].map((match) => match[1].trim()).filter((point) => !/^\(use/.test(point));
  const student = prompt.match(/^Student answer:\s*([\s\S]*)$/m)?.[1]?.trim() ?? "";
  const expected = keyPoints.length ? keyPoints.map((point) => point.toLowerCase()) : keywordsOf(model).slice(0, 4);
  const { hits, misses, ratio } = overlap(expected, student);
  const blank = student.length < 3 || /^\(blank\)$/.test(student);
  const contradiction = /\bnot\b/i.test(student) && !/\bnot\b/i.test(model);
  const score = blank ? 0 : Math.max(0, Math.round(ratio * 100) - (contradiction ? 30 : 0));
  const verdict = score >= 80 ? "correct" : score >= 40 ? "partial" : "incorrect";
  return {
    verdict,
    score,
    correct_points: hits,
    missing_points: misses,
    incorrect_points: contradiction ? ["Your answer negates something the material states."] : [],
    feedback:
      verdict === "correct"
        ? `Well recalled — you covered ${hits.join(", ") || "the key idea"}.`
        : verdict === "partial"
          ? `Partly there: you mentioned ${hits.join(", ") || "part of it"}; the model answer also includes ${misses.slice(0, 2).join(", ")}.`
          : blank
            ? "No answer yet — read the model answer, then try this prompt again later."
            : `Not quite. Re-read the source: the answer centers on ${expected.slice(0, 3).join(", ")}.`,
  };
}

/** Deterministic Feynman concepts: definitions with their following sentence as the ideal explanation. */
export function feynmanConceptsHeuristically(transcript: string, prompt: string) {
  const count = Number(prompt.match(/Produce exactly (\d+) concepts/)?.[1] ?? "3");
  const facts = collectFacts(transcript);
  const withTerms = facts.filter((fact) => fact.term);
  const pool = withTerms.length ? withTerms : facts;
  const concepts = pool.slice(0, count).map((fact) => ({
    concept: (fact.term ?? fact.heading).slice(0, 60),
    ideal_explanation: [fact.sentence, fact.next].filter(Boolean).join(" "),
    key_points: keywordsOf(fact.definition ?? fact.sentence).slice(0, 4),
    source_excerpt: fact.sentence.slice(0, 300),
  }));
  return { concepts };
}

/** Deterministic Feynman analysis: key-point overlap plus a length check for complexity. */
export function feynmanAnalysisHeuristically(prompt: string) {
  const ideal = prompt.match(/^Ideal explanation:\s*(.+)$/m)?.[1] ?? "";
  const keyPoints = [...prompt.matchAll(/^- (.+)$/gm)].map((match) => match[1].trim());
  const explanation = prompt.match(/^Student explanation:\s*([\s\S]*)$/m)?.[1]?.trim() ?? "";
  const expected = keyPoints.length ? keyPoints.map((point) => point.toLowerCase()) : keywordsOf(ideal).slice(0, 4);
  const { hits, misses, ratio } = overlap(expected, explanation);
  const blank = explanation.length < 3 || /^\(blank\)$/.test(explanation);
  const tooLong = explanation.length > ideal.length * 3 + 200;
  const contradiction = /\bnot\b/i.test(explanation) && !/\bnot\b/i.test(ideal);
  const score = blank ? 0 : Math.max(0, Math.round(ratio * 100) - (contradiction ? 25 : 0) - (tooLong ? 10 : 0));
  return {
    score,
    correct_concepts: hits,
    missing_concepts: misses,
    incorrect_ideas: contradiction ? ["Part of the explanation negates what the material states."] : [],
    unnecessary_complexity: tooLong ? ["The explanation is much longer than a beginner needs."] : [],
    feedback:
      score >= 80
        ? "Clear and complete — a beginner could follow this."
        : score >= 40
          ? `Good start. You explained ${hits.join(", ") || "part of it"}, but a beginner would still ask about ${misses.slice(0, 2).join(" and ")}.`
          : blank
            ? "Write the explanation in your own words first — even a rough version gives us something to improve."
            : "The core idea is missing. Start from what the concept is for, then how it works.",
    improve_prompt: misses.length ? `Add how ${misses.slice(0, 2).join(" and ")} fit in, in one or two plain sentences.` : "Tighten the wording and add one concrete example from the material.",
  };
}

// ---------------------------------------------------------------------------
// AI tutor
// ---------------------------------------------------------------------------

type MockPassage = { position: number; heading: string | null; pages: string | null; sentences: string[] };

function parsePassages(material: string): MockPassage[] {
  const passages: MockPassage[] = [];
  let current: MockPassage | null = null;
  for (const line of material.split("\n")) {
    const label = line.match(/^\[Section (\d+)(?::\s*([^,\]]+))?(?:,\s*pages?\s([^\]]+))?\]$/);
    if (label) {
      current = { position: Number(label[1]), heading: label[2]?.trim() ?? null, pages: label[3]?.trim() ?? null, sentences: [] };
      passages.push(current);
      continue;
    }
    if (!line.trim()) continue;
    if (!current) {
      current = { position: 0, heading: null, pages: null, sentences: [] };
      passages.push(current);
    }
    if (isHeadingLike(line.trim())) continue;
    current.sentences.push(...sentencesOf(line));
  }
  return passages;
}

/** Deterministic tutor: finds the sentences that share keywords with the question and answers from them. */
export function tutorReplyHeuristically(material: string, prompt: string, system: string, previousAnswer = "") {
  const message = extractTag(prompt, "student_message") ?? "";
  const selection = extractTag(prompt, "highlight") ?? "";
  const action = prompt.match(/^Requested action:\s*([^—\n]+)/m)?.[1]?.trim().toLowerCase() ?? "";
  const noMaterial = /\(no material attached/.test(material) || material.trim().length === 0;
  // A follow-up names the answer it is about; its words stand in for the topic.
  const focus = extractTag(prompt, "focus")?.match(/Your answer: ([\s\S]*)$/)?.[1]?.trim() ?? "";
  const priorAnswer = focus && focus !== "(your last reply above)" ? focus : previousAnswer;
  const mode = /Socratic mode/.test(system) ? "socratic" : /Guided mode/.test(system) ? "guided" : /Elaborative interrogation mode/.test(system) ? "elaborative" : /Self-explanation mode/.test(system) ? "self_explanation" : /Teach-back mode/.test(system) ? "teach_back" : "tutor";

  // "What is my name?": the first name Tamari's request carries.
  if (/\bwhat(?:'s| is) my name\b|\bano(?:ng)? pangalan ko\b/i.test(message)) {
    const firstName = prompt.match(/^First name: (.+)$/m)?.[1]?.trim();
    return {
      answer: firstName ? `You're ${firstName}! What are we studying today?` : "I don't see your name in RevTaw. What should I call you?",
      grounding: "general",
      sources: [],
      additional_explanation: null,
      follow_ups: [],
      flashcard: null,
    };
  }

  // A question about the student's own study data: answer from the snapshot Tamari's request carries.
  const snapshot = prompt.match(/The student's study data in RevTaw right now:\n((?:- .*(?:\n|$))+)/)?.[1]?.trim();
  if (snapshot) {
    const facts = snapshot.split("\n").map((line) => line.replace(/^- /, "").trim()).filter(Boolean);
    return {
      answer: `Here's what RevTaw shows for you right now:\n\n${facts.map((fact) => `- ${fact}`).join("\n")}\n\nStart with the first weak concept on that list — a short active recall round on it moves it fastest.`,
      grounding: "general",
      sources: [],
      additional_explanation: null,
      follow_ups: ["test_me", "explain_more"],
      flashcard: null,
    };
  }

  const passages = noMaterial ? [] : parsePassages(material);
  // Follow-ups ("Simplify this.") carry no topic words of their own; fall back to the previous answer's keywords.
  const ownTerms = keywordsOf(`${selection} ${message}`).filter((word) => !/^(explain|simplify|summarize|example|analogy|step|quiz|guide|material|answer|wrong|more|like|beginner|mnemonic|compare|related|ideas|give|keep|asking|until|reason|clear|true|without|giving|this)$/.test(word));
  const terms = new Set(ownTerms.length ? ownTerms : keywordsOf(priorAnswer));
  const scored = passages
    .flatMap((passage) => passage.sentences.map((sentence) => ({ passage, sentence, score: keywordsOf(sentence).filter((word) => terms.has(word)).length })))
    .filter((entry) => entry.score > 0 || (selection && entry.sentence.includes(selection.slice(0, 40))))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const best = scored[0];
  const flashcard = best ? { front: `What does the material say about ${keywordsOf(best.sentence)[0] ?? "this"}?`, back: best.sentence } : null;
  const sources = scored.map((entry) => ({ position: entry.passage.position, heading: entry.passage.heading, pages: entry.passage.pages, quote: entry.sentence.slice(0, 200) }));

  if (mode === "socratic" || mode === "guided" || mode === "elaborative" || mode === "self_explanation" || mode === "teach_back") {
    const topic = best ? keywordsOf(best.sentence)[0] ?? "this idea" : "this idea";
    const question =
      mode === "socratic"
        ? `What makes you think that? Which part of the material supports your view of ${topic}, and is there another explanation?`
        : mode === "elaborative"
          ? `Why is that true? What causes ${topic} to work the way the material describes?`
          : mode === "self_explanation"
            ? `Look at this step: "${best?.sentence ?? "the first step of the process"}". Why does this step work, and what should happen next?`
            : mode === "teach_back"
              ? /^Start this/.test(message)
                ? `I have never heard of ${topic} before. Could you teach it to me from the beginning — what is it, and why does it matter?`
                : `Thanks, that helps. One thing I do not get yet: what do you mean by ${topic}? Could you give me an example of how it works?`
              : `Here is a hint instead of the answer: look for where the material mentions ${topic}. What do you think the key idea is?`;
    return {
      answer: `${/^Start this/.test(message) ? (mode === "teach_back" ? "Okay, I'm your student today. " : "Let's begin. ") : mode === "teach_back" ? "" : "Good — let's reason through it together. "}${question}`,
      grounding: best ? "material" : "general",
      sources,
      additional_explanation: null,
      follow_ups: ["explain_more", "example"],
      flashcard: null,
    };
  }

  if (/quiz/.test(action)) {
    return {
      answer: best ? `Quick check: based on the material, what is stated about ${keywordsOf(best.sentence).slice(0, 2).join(" ")}? Answer in one or two sentences and I will check it.` : "What would you like to be quizzed on? Pick a section of the material first.",
      grounding: best ? "material" : "not_found",
      sources,
      additional_explanation: null,
      follow_ups: ["explain_more", "simplify"],
      flashcard: null,
    };
  }

  if (/visualize/.test(action)) {
    const source = selection || scored.map((entry) => entry.sentence).join(" ") || best?.sentence || message;
    const visual = visualForSection(best?.passage.heading ?? "Selection", source, 1);
    return {
      answer: `Here is the highlighted idea as a ${visual.type === "hierarchy" ? "diagram" : visual.type}, built from your material.`,
      grounding: best ? "material" : "general",
      sources,
      additional_explanation: null,
      follow_ups: ["explain_more", "example"],
      flashcard: null,
      visual,
    };
  }

  if (!best) {
    return {
      answer: noMaterial
        ? `Here is a general explanation of "${message.slice(0, 80)}": the mock tutor cannot look anything up, so configure a real AI provider for full answers.`
        : "I couldn't verify this from your uploaded material. The passages I have do not mention it — try rephrasing, or ask about a section you can see in the Content tab.",
      grounding: noMaterial ? "general" : "not_found",
      sources: [],
      additional_explanation: noMaterial ? "This answer comes from general knowledge, not from an uploaded material." : null,
      follow_ups: ["simplify", "example"],
      flashcard: null,
    };
  }

  const lead =
    /simplify|beginner/.test(action)
      ? `In simple words: ${best.sentence}`
      : /example/.test(action)
        ? `Example from the material: ${best.sentence}`
        : /analogy/.test(action)
          ? `**Analogy:** think of it like a kitchen recipe — ingredients go in, a product comes out.\n\n**Actual definition:** ${best.sentence}`
          : /step/.test(action)
            ? scored.map((entry, index) => `${index + 1}. ${entry.sentence}`).join("\n")
            : /summar/.test(action)
              ? scored.map((entry) => `- ${entry.sentence}`).join("\n")
              : /mnemonic/.test(action)
                ? `Mnemonic: **${keywordsOf(best.sentence).slice(0, 3).map((word) => word[0].toUpperCase()).join("")}** — ${keywordsOf(best.sentence).slice(0, 3).join(", ")}.\n\nFrom the material: ${best.sentence}`
                : /compare/.test(action)
                  ? scored.length > 1
                    ? `Compared side by side:\n- ${scored[0].sentence}\n- ${scored[1].sentence}`
                    : `The material only covers one side here: ${best.sentence}`
                  : /why/.test(action)
                    ? `According to the material: ${best.sentence}\n\nNow you: why do you think that is the case?`
                    : best.sentence;
  return {
    answer: lead,
    grounding: "material",
    sources,
    additional_explanation: /analogy/.test(action) ? "The analogy is a general illustration, not part of your material." : null,
    follow_ups: ["explain_more", "example", "simplify", "test_me"],
    flashcard,
  };
}

/** Deterministic coach evaluation: counts substantive student turns. */
export function tutorEvaluationHeuristically(prompt: string) {
  const turns = [...prompt.matchAll(/^Student:\s*([\s\S]*?)(?=\n\n(?:Student|Tutor):|$)/gm)].map((match) => match[1].trim()).filter((turn) => turn && turn !== "(no messages)");
  const substantive = turns.filter((turn) => keywordsOf(turn).length >= 3);
  const score = turns.length === 0 ? 0 : Math.min(100, Math.round((substantive.length / turns.length) * 70 + Math.min(30, turns.length * 10)));
  const concepts = [...new Set(turns.flatMap((turn) => keywordsOf(turn).slice(0, 2)))].slice(0, 6);
  return {
    score,
    strengths: substantive.length ? [`Gave ${substantive.length} reasoned answer${substantive.length === 1 ? "" : "s"} in your own words.`] : [],
    missing_concepts: substantive.length < turns.length ? ["Some replies were too short to show reasoning."] : [],
    suggestion: score >= 70 ? "Strong reasoning — try a practice test on this material next." : "Answer each question with a reason, not just a word; Tamari can only help with what you explain.",
    concepts_covered: concepts,
  };
}
