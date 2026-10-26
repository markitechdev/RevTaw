import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { knownConceptsLine } from "@/lib/concepts/service";
import { buildTranscript, coverageNote, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import { EDUCATION_LEVEL_LABEL, STUDY_GOAL_LABEL } from "@/lib/profile/options";
import { MaterialText, matchWords, overlap } from "@/lib/quizzes/grounding";
import { upTo } from "@/lib/study/prompts/shared";
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
  cards: z.array(cardSchema).max(80),
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

/** A card side's words for comparing cards, in any script; a side that is only symbols ("√", "∑") keeps them. */
function sideKey(text: string): string {
  return matchWords(text).join(" ") || text.replace(/\s+/g, "").toLowerCase();
}

/** The most a back may say: one idea in a sentence or two, not a paragraph. */
const MAX_BACK_CHARS = 350;
const MAX_BACK_SENTENCES = 3;

function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+(?=\S)/).filter((part) => matchWords(part).length > 0).length;
}

/**
 * Whether two cards teach the same thing: the same front; the same definition asked for two ways ("Photosynthesis"
 * and "What is photosynthesis?" with one back); one card reversed ("____ is the process by which…" → "Photosynthesis");
 * or the same card reworded. Two questions with the same one-word answer about different facts are different cards.
 */
function sameCard(a: GeneratedCard, b: GeneratedCard): boolean {
  if (sideKey(a.front) === sideKey(b.front)) return true;
  const longBack = matchWords(a.back).length >= 4 && matchWords(b.back).length >= 4;
  if (overlap(a.back, b.back) >= 0.8 && (longBack || overlap(a.front, b.front) >= 0.5)) return true;
  if (overlap(a.front, b.back) >= 0.8 && overlap(a.back, b.front) >= 0.8) return true;
  return overlap(`${a.front} ${a.back}`, `${b.front} ${b.back}`) >= 0.8;
}

/** What makes a card unusable on its own, or null when it's fine. */
function cardProblem(card: GeneratedCard): string | null {
  if (!card.front.trim() || !card.back.trim()) return "an empty side";
  if (sideKey(card.back) === sideKey(card.front)) return "a back that repeats the front";
  if ((card.front.match(/_{2,}/g) ?? []).length > 1) return "more than one blank";
  if (card.back.length > MAX_BACK_CHARS || sentenceCount(card.back) > MAX_BACK_SENTENCES) return "a back too long to recall";
  // The front already says the whole answer.
  const front = new Set(matchWords(card.front));
  const back = [...new Set(matchWords(card.back))];
  if (back.length >= 2 && back.every((word) => front.has(word))) return "a front that gives the answer away";
  return null;
}

export type FinalizeCardsContext = {
  /** The material the cards must come from: a card whose supporting quote isn't in it is dropped (a made-up source). */
  material?: MaterialText;
};

/**
 * Checks the model's cards and trims them to the requested count: drops a card with an empty side, a back that
 * repeats the front or runs past a couple of sentences, more than one blank, or a front that gives the answer
 * away; drops repeats of a card already kept (in any script); and, with the material, drops a card whose quote
 * isn't in it, replacing a loose quote with the material's own words.
 */
export function finalizeCards(cards: GeneratedCard[], count: number, context: FinalizeCardsContext = {}): GeneratedCard[] {
  const kept: GeneratedCard[] = [];
  for (const generated of cards) {
    let card = { ...generated, front: generated.front.trim(), back: generated.back.trim() };
    if (cardProblem(card)) continue;
    if (context.material) {
      const quote = context.material.ground(card.source_excerpt ?? "");
      if (!quote) continue;
      card = { ...card, source_excerpt: quote };
    }
    const candidate = card;
    if (kept.some((other) => sameCard(other, candidate))) continue;
    kept.push(candidate);
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
- One fact, term, formula or question per card. Front: a term, a question or a sentence with one blank ("____"); it never contains the answer. Back: the answer or definition in at most two sentences (longer backs are dropped).
- Mix card styles: term → definition, question → answer, blank → missing phrase, formula → meaning. Prefer the material's own wording.
- Cover the whole material evenly; no duplicates or trivial variations; skip page numbers and formatting trivia.
- "hint": optional short nudge (max 100 chars) that does not give the answer away, or null.
- "concept": the 1-4 word concept the card belongs to (reuse the same wording for the same concept; when the message lists the material's concept names, a card on one of them uses that name, and only a concept not listed gets a new one).
- "source_excerpt": a short verbatim quote (max 300 chars) copied exactly from the material that supports the back; a card whose quote isn't in the material is dropped.
- Use ONLY the material between <material> tags. Never invent facts.
- Respond with a single JSON object matching the schema. No commentary.`;

  const user = `Material title: ${materialTitle}
Student: ${studentLine(student)}
${options.focus ? `Focus on: ${options.focus}\n` : ""}${knownConceptsLine(options.knownConcepts ?? [])}${coverageNote(coverageRatio, focused)}
${upTo(options.count, "cards")}

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
    cards: finalizeCards(result.data.cards, options.count, { material: new MaterialText(chunks.map((chunk) => chunk.content)) }),
    provider: result.raw.provider,
    model: result.raw.model,
    coverageRatio,
    focused,
  };
}
