import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { knownConceptsLine } from "@/lib/concepts/service";
import { buildTranscript, coverageNote, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import { EDUCATION_LEVEL_LABEL, STUDY_GOAL_LABEL } from "@/lib/profile/options";
import { modelTitle } from "@/lib/ai/fields";
import { clampTitle } from "@/lib/text/clamp";

const cardSchema = z.object({
  front: z.string().trim().min(1).max(2000),
  back: z.string().trim().min(1).max(4000),
  hint: z.string().trim().max(500).nullable().default(null),
  concept: z.string().trim().min(1).max(120),
  source_excerpt: z.string().trim().max(1000).default(""),
});

export const flashcardResponseSchema = z.object({
  title: modelTitle(),
  cards: z.array(cardSchema).min(1).max(80),
});

export type GeneratedCard = z.infer<typeof cardSchema>;

export type GenerateFlashcardsResult = {
  title: string;
  cards: GeneratedCard[];
  provider: string;
  model: string;
  coverageRatio: number;
  /** A long material was cut to the deck's focus first. */
  focused: boolean;
};

function studentLine(student: StudentContext): string {
  return (
    [
      student.educationLevel ? `education level: ${EDUCATION_LEVEL_LABEL[student.educationLevel]}` : null,
      student.mainGoal ? `main goal: ${STUDY_GOAL_LABEL[student.mainGoal]}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "not specified"
  );
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Drops duplicate fronts and trims to the requested count. */
export function finalizeCards(cards: GeneratedCard[], count: number): GeneratedCard[] {
  const seen = new Set<string>();
  const kept: GeneratedCard[] = [];
  for (const card of cards) {
    const key = normalize(card.front);
    if (!key || seen.has(key)) continue;
    if (normalize(card.back) === key) continue;
    seen.add(key);
    kept.push(card);
  }
  return kept.slice(0, count);
}

/** Generates front/back flashcards grounded in the material. */
export async function generateFlashcards(
  materialTitle: string,
  chunks: AnalysisChunkInput[],
  options: { count: number; focus: string | null; knownConcepts?: string[] },
  student: StudentContext,
): Promise<GenerateFlashcardsResult> {
  const provider = getAiProvider("strong");
  const { transcript, coverageRatio, focused } = buildTranscript(chunks, undefined, options.focus ? { text: options.focus } : null);

  const system = `You are RevTaw's flashcard writer. You turn a student's uploaded material into flashcards for spaced repetition.

Card rules:
- One fact, term, formula or question per card. Front: a term, a question or a sentence with one blank ("____"). Back: the answer or definition in at most two sentences.
- Mix card styles: term → definition, question → answer, blank → missing phrase, formula → meaning. Prefer the material's own wording.
- Cover the whole material evenly; no duplicates or trivial variations; skip page numbers and formatting trivia.
- "hint": optional short nudge (max 100 chars) that does not give the answer away, or null.
- "concept": the 1-4 word concept the card belongs to (reuse the same wording for the same concept; when the message lists the material's concept names, a card on one of them uses that name, and only a concept not listed gets a new one).
- "source_excerpt": a short verbatim quote (max 300 chars) from the material supporting the back.
- Use ONLY the material between <material> tags. Never invent facts.
- Respond with a single JSON object matching the schema. No commentary.`;

  const user = `Material title: ${materialTitle}
Student: ${studentLine(student)}
${options.focus ? `Focus on: ${options.focus}\n` : ""}${knownConceptsLine(options.knownConcepts ?? [])}${coverageNote(coverageRatio, focused)}
Produce exactly ${options.count} cards.

JSON schema:
{
  "title": string (max 160, e.g. "${materialTitle} — Flashcards"),
  "cards": [{ "front": string, "back": string, "hint": string | null, "concept": string, "source_excerpt": string }]
}

<material>
${transcript}
</material>`;

  const result = await generateJson(provider, flashcardResponseSchema, {
    task: "generate_flashcards",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 8000,
    temperature: 0.4,
  });

  return {
    title: clampTitle(result.data.title),
    cards: finalizeCards(result.data.cards, options.count),
    provider: result.raw.provider,
    model: result.raw.model,
    coverageRatio,
    focused,
  };
}
