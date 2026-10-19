import type { AiGenerateOptions, AiGenerateResult, AiProvider } from "@/lib/ai/types";

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
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
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
            ? "The material contains formulas, so practising problems builds fluency."
            : method === "interleaving" || method === "practice_testing"
              ? "The material covers many topics, so mixing them prepares you for exams."
              : "The material is concept-heavy, so explaining ideas in your own words deepens understanding.",
    })),
    language: "en",
  };
}

/** Splits a RevTaw transcript into its labelled sections. */
export function parseTranscriptSections(transcript: string): Array<{ heading: string; text: string }> {
  const sections: Array<{ heading: string; text: string }> = [];
  let current: { heading: string; text: string[] } | null = null;
  for (const line of transcript.split("\n")) {
    const label = line.match(/^\[Section(?::\s*(.+?))?(?:,\s*pages?\s[^\]]+)?\]$/);
    if (label) {
      if (current) sections.push({ heading: current.heading, text: current.text.join("\n").trim() });
      current = { heading: (label[1] ?? `Section ${sections.length + 1}`).trim(), text: [] };
      continue;
    }
    if (/^\[Not included/.test(line)) continue;
    if (!current) current = { heading: "Overview", text: [] };
    current.text.push(line);
  }
  if (current) sections.push({ heading: current.heading, text: current.text.join("\n").trim() });
  // Chunks keep their heading as the first line; drop it so it does not glue onto the first sentence.
  return sections
    .map((section) => ({
      heading: section.heading,
      text: section.text.replace(new RegExp(`^${section.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n`, "i"), "").trim(),
    }))
    .filter((section) => section.text.length > 0);
}

function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 15);
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

type MockFact = { term: string | null; definition: string | null; sentence: string; heading: string; next: string | null };

function stripArticle(term: string): string {
  return term.replace(/^(the|a|an)\s+/i, "").trim();
}

function negate(sentence: string): string {
  const negated = sentence.replace(/\b(is|are|was|were|can|does|do|has|have|will)\b(?! not)/, "$1 not");
  return negated === sentence ? `It is false that ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}` : negated;
}

function keywordsOf(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? [])].filter(
    (word) => !/^(this|that|with|from|which|their|there|these|those|than|then|into|also|been|have|were|what|when|where|about|other|some|such|more|most|only|very|will|would|could|should|because|while|after|before|between|through|under|over|each|every)$/.test(word),
  );
}

function collectFacts(transcript: string): MockFact[] {
  const sections = parseTranscriptSections(transcript);
  const facts: MockFact[] = [];
  for (const section of sections) {
    const sentences = sentencesOf(section.text).filter((sentence) => sentence.length <= 240);
    sentences.forEach((sentence, index) => {
      const match = sentence.match(/^((?:[A-Z][\w'-]*|[a-z][\w'-]*)(?:\s+[\w'-]+){0,4}?)\s+(?:is|are|refers to|means|is defined as)\s+(.+?)[.!?]?$/);
      facts.push({
        term: match ? stripArticle(match[1]) : null,
        definition: match ? match[2].trim() : null,
        sentence,
        heading: section.heading,
        next: sentences[index + 1] ?? null,
      });
    });
  }
  // Definitions first: they make the best objective questions.
  return [...facts.filter((fact) => fact.term), ...facts.filter((fact) => !fact.term)];
}

/** Deterministic quiz: cycles through the material's facts per requested type. */
export function quizHeuristically(transcript: string, prompt: string) {
  const materialTitle = prompt.match(/Material title:\s*(.+)/)?.[1]?.trim() ?? "Material";
  const plan = [...prompt.matchAll(/^- ([a-z_]+): (\d+)$/gm)].map((match) => ({ type: match[1], count: Number(match[2]) }));
  const fixedDifficulty = prompt.match(/"(easy|medium|hard)" for every question/)?.[1] ?? null;
  const facts = collectFacts(transcript);
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
        difficulty: fixedDifficulty ?? difficulties[serial % 3],
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
