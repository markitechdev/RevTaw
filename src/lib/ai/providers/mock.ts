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
    const material = extractTag(userText, "material") ?? userText;
    const task = options.task ?? inferTask(options);

    let text: string;
    switch (task) {
      case "analyze_material":
        text = JSON.stringify(analyzeHeuristically(material));
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
