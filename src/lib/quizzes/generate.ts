import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { generateJson } from "@/lib/ai/json";
import { knownConceptsLine } from "@/lib/concepts/service";
import { buildTranscript, coverageNote, type AnalysisChunkInput, type StudentContext } from "@/lib/materials/analyze";
import { EDUCATION_LEVEL_LABEL, STUDY_GOAL_LABEL } from "@/lib/profile/options";
import { MaterialText, matchWords, overlap } from "@/lib/quizzes/grounding";
import { optionSchema } from "@/lib/quizzes/schemas";
import { normalizeText } from "@/lib/quizzes/text-match";
import { distributeQuestions, QUESTION_TYPE_BY_ID, QUESTION_TYPE_IDS, TWO_STATEMENT_CHOICES, type QuizConfig } from "@/lib/quizzes/types";
import { seededRandom, shuffled } from "@/lib/random";
import type { QuestionDifficulty, QuestionType } from "@/lib/supabase/database.types";
import { modelTitle } from "@/lib/ai/fields";
import { clampTitle } from "@/lib/text/clamp";

const text = (max: number) => z.string().trim().min(1).max(max);

const baseQuestion = {
  difficulty: z.enum(["easy", "medium", "hard"]),
  prompt: text(4000),
  explanation: text(4000),
  concept: text(120),
  source_excerpt: z.string().trim().max(1000).default(""),
};

/** An option as the model writes it: with why it is right or wrong (moved into the hidden answer before storing). */
const generatedOptionSchema = optionSchema.extend({ why: z.string().trim().max(600).optional() });

const generatedQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("multiple_choice"),
    ...baseQuestion,
    options: z.array(generatedOptionSchema).min(3).max(6),
    answer: z.object({ option_id: z.string().trim().min(1).max(4), rationales: z.record(z.string(), z.string().trim().min(1).max(600)).optional() }),
  }),
  z.object({
    type: z.literal("true_false"),
    ...baseQuestion,
    answer: z.object({ value: z.boolean(), correction: z.string().trim().max(1000).optional() }),
  }),
  z.object({
    type: z.literal("two_statement"),
    ...baseQuestion,
    statements: z.array(z.object({ text: text(600), is_true: z.boolean(), why: z.string().trim().max(600).optional() })).length(2),
    // Written by RevTaw from the statements (tidyTwoStatement), never by the model.
    options: z.array(optionSchema).optional(),
    answer: z.object({ option_id: z.string().trim().min(1).max(4), rationales: z.record(z.string(), z.string().trim().min(1).max(600)).optional() }).optional(),
  }),
  z.object({
    type: z.literal("identification"),
    ...baseQuestion,
    answer: z.object({ accepted: z.array(text(300)).min(1).max(12) }),
  }),
  z.object({
    type: z.literal("fill_blank"),
    ...baseQuestion,
    answer: z.object({ accepted: z.array(text(300)).min(1).max(12) }),
  }),
  ...(["short_answer", "essay", "scenario", "case_based", "problem_solving"] as const).map((type) =>
    z.object({
      type: z.literal(type),
      ...baseQuestion,
      answer: z.object({ model_answer: text(4000), rubric: z.array(text(300)).max(8).default([]) }),
    }),
  ),
]);

export const quizResponseSchema = z.object({
  title: modelTitle(),
  questions: z.array(generatedQuestionSchema).min(1).max(60),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
export type QuizResponse = z.infer<typeof quizResponseSchema>;

export type AdaptiveTargets = {
  /** Per-concept target difficulty from the mastery model. */
  targets: Array<{ concept: string; difficulty: "easy" | "medium" | "hard" | "advanced" }>;
  /** Concepts that should get a larger share of questions. */
  focusConcepts: string[];
  /** Difficulty for concepts without a target, from the student's overall ability. */
  fallback?: QuestionDifficulty;
};

export type GenerateQuizResult = {
  title: string;
  questions: GeneratedQuestion[];
  provider: string;
  model: string;
  coverageRatio: number;
  /** A long material was cut to the quiz's focus (its topic, or the student's weak concepts) first. */
  focused: boolean;
};

const TYPE_RULES: Record<QuestionType, string> = {
  multiple_choice:
    'exactly four options with ids "a"-"d" and exactly one correct per the material. Distractors are plausible to a student who half-knows the topic (related terms, common confusions, partly true statements), clearly wrong per the material, and in the same category, form and length as the correct option. Never "all of the above", "none of the above", "both a and b", or two options that mean the same. Avoid negative stems; if one is needed, write NOT or EXCEPT in capitals. Each option has "why": one sentence from the material on why it is right or wrong. "answer": {"option_id": "a"}',
  true_false:
    'a single declarative statement that is entirely true or entirely false per the material, never partly true. Make roughly half false by changing one meaningful detail (a term, cause, number or relationship), not by adding "not" or a trick of wording, and no absolute words (always, never, only) as giveaways unless the material uses them. "answer": {"value": true}; for a false statement also "correction": the true version of the statement',
  two_statement:
    'two statements about one concept, or about two concepts students mix up, each entirely true or entirely false per the material (make one false by changing one meaningful detail, as for true/false). "statements": [{"text": "...", "is_true": true, "why": "one sentence from the material on why it is true or false"}, {...}] in that order; "prompt": a one-line lead-in that names the topic without giving anything away (e.g. "Which of these statements about osmosis are true?"). RevTaw adds the choices (only statement 1, only statement 2, both, neither). Across the set, vary which statements are true. "source_excerpt": the material\'s words for both statements, the two quotes joined by " ... ". No "answer" field',
  identification:
    'describe a term, person, process or idea in enough detail that only one name fits, and ask for that name. "answer": {"accepted": ["the name as the material writes it", "exact synonyms or abbreviations the material uses"]}; never accept a broader or narrower term',
  fill_blank:
    'a sentence from the material with one key term (not a filler word) replaced by "____"; the rest of the sentence leaves only one term that fits. "answer": {"accepted": ["the missing term as the material writes it", "exact variants"]}',
  short_answer:
    'answerable in 1-2 sentences; "answer": {"model_answer": "...", "rubric": ["point the answer must contain", ...]}',
  essay:
    'asks to explain or compare, answerable in one paragraph; "answer": {"model_answer": "...", "rubric": ["required point", ...]}',
  scenario:
    'presents a realistic situation and asks the student to apply the material; "answer": {"model_answer": "...", "rubric": [...]}',
  case_based:
    'presents a short case with details and asks for an analysis or decision with justification; "answer": {"model_answer": "...", "rubric": [...]}',
  problem_solving:
    'poses a problem that must be worked out step by step (numbers, formulas or procedures from the material); "answer": {"model_answer": "steps and final answer", "rubric": [...]}',
};

/**
 * What each difficulty asks of the student. Difficulty is the thinking a question takes, not longer
 * wording: an easy question recalls, a medium one understands or applies, a hard one analyzes.
 */
const DIFFICULTY_RULES = `Difficulty levels (the thinking a question takes, not longer wording):
- easy: recall one fact the material states directly (a definition, name, number or step). Multiple-choice distractors come from other parts of the material.
- medium: understand or apply one idea: answer from a paraphrase rather than the material's exact words, explain why, or pick the example that fits. Distractors are closely related terms or ideas.
- hard: analyze: connect two or more ideas from different parts of the material, apply them to a new situation, or tell apart closely related concepts. Distractors are common misconceptions or partly true statements.
- advanced (adaptive targets only): like hard, with more than one step of reasoning and no hints in the question.
For open questions, difficulty is how much reasoning the model answer needs.`;

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

/** Options that make a multiple-choice answer a matter of test-taking rather than of the material. */
const CATCH_ALL_OPTION = /\b(?:all|none|neither|both) of (?:the )?(?:above|these|them)\b|^(?:all|none) (?:of )?(?:the )?above\.?$|^both [a-f] and [a-f]\.?$|lahat ng (?:nabanggit|nasa itaas)|wala sa (?:nabanggit|mga ito|nasa itaas)/i;
const OPTION_IDS = ["a", "b", "c", "d", "e", "f"];

type ChoiceQuestion = Extract<GeneratedQuestion, { type: "multiple_choice" }>;

/**
 * A multiple-choice question as it is stored, or null when it can't be used: duplicate ids, an answer that
 * isn't an option, two options that say the same thing, or a catch-all option ("all of the above"). The
 * options are shuffled once (models tend to put the right one first) and lettered a, b, c… in the new order;
 * each option's "why" moves into the answer (`rationales`), which stays on the server until it's answered.
 */
function tidyChoiceQuestion(question: ChoiceQuestion): ChoiceQuestion | null {
  const ids = question.options.map((option) => option.id.toLowerCase());
  if (new Set(ids).size !== ids.length) return null;
  const answerId = question.answer.option_id.toLowerCase();
  if (!ids.includes(answerId)) return null;
  const texts = question.options.map((option) => normalizeText(option.text));
  if (texts.some((value) => !value) || new Set(texts).size !== texts.length) return null;
  if (question.options.some((option) => CATCH_ALL_OPTION.test(option.text.trim()))) return null;
  const order = shuffled(
    question.options.map((_, index) => index),
    seededRandom(question.prompt),
  );
  const rationales: Record<string, string> = {};
  const options = order.map((from, position) => {
    const option = question.options[from];
    const why = option.why?.trim() || question.answer.rationales?.[option.id]?.trim() || question.answer.rationales?.[option.id.toLowerCase()]?.trim();
    if (why) rationales[OPTION_IDS[position]] = why;
    return { id: OPTION_IDS[position], text: option.text };
  });
  const correct = OPTION_IDS[order.findIndex((from) => ids[from] === answerId)];
  return { ...question, options, answer: { option_id: correct, ...(Object.keys(rationales).length ? { rationales } : {}) } };
}

type TwoStatementQuestion = Extract<GeneratedQuestion, { type: "two_statement" }>;

const DEFAULT_TWO_STATEMENT_LEAD = "Which of these statements are true?";

/**
 * A two-statement question as stored, or null when it can't be used (a statement empty, or the two the same).
 * RevTaw writes the prompt (the lead-in, then "Statement 1: …" and "Statement 2: …" on their own lines), the
 * four choices in their fixed order, the answer they imply, and why each wrong choice is wrong: which
 * statement it misjudges and what the material says about it.
 */
function tidyTwoStatement(question: TwoStatementQuestion): TwoStatementQuestion | null {
  const statements = question.statements.map((statement) => ({ ...statement, text: statement.text.replace(/^statement\s*[12]\s*[:.)-]\s*/i, "").replace(/\s+/g, " ").trim() }));
  const [first, second] = statements;
  if (matchWords(first.text).length < 3 || matchWords(second.text).length < 3 || overlap(first.text, second.text) >= 0.9) return null;
  // A lead-in that repeats a statement (or has none) gives way to the plain one.
  const lead = question.prompt.replace(/\s+/g, " ").trim();
  const usable = lead && !/statement\s*[12]\s*:/i.test(lead) && statements.every((statement) => overlap(lead, statement.text) < 0.5);
  const truth = [first.is_true, second.is_true] as const;
  const correct = TWO_STATEMENT_CHOICES.find((choice) => choice.claims[0] === truth[0] && choice.claims[1] === truth[1])!;
  // "Statement 2 is false: the material says it happens in the stroma." for each statement.
  const verdicts = statements.map((statement, index) => {
    const why = statement.why?.trim();
    return `Statement ${index + 1} is ${statement.is_true ? "true" : "false"}${why ? `: ${/[.!?]["'”’)\]]*$/.test(why) ? why : `${why}.`}` : "."}`;
  });
  const rationales: Record<string, string> = {};
  for (const choice of TWO_STATEMENT_CHOICES) {
    if (choice.id === correct.id) continue;
    const why = verdicts.filter((_, index) => choice.claims[index] !== truth[index]).join(" ");
    rationales[choice.id] = why.length > 600 ? `${why.slice(0, 597).trimEnd()}…` : why;
  }
  return {
    ...question,
    statements,
    prompt: `${usable ? lead : DEFAULT_TWO_STATEMENT_LEAD}\nStatement 1: ${first.text}\nStatement 2: ${second.text}`,
    // The verdict on both statements explains the answer, right or wrong; the model's own explanation when it gave no reasons.
    explanation: statements.every((statement) => statement.why?.trim()) ? verdicts.join(" ") : question.explanation,
    options: TWO_STATEMENT_CHOICES.map(({ id, text }) => ({ id, text })),
    answer: { option_id: correct.id, rationales },
  };
}

type TrueFalseQuestion = Extract<GeneratedQuestion, { type: "true_false" }>;

/** A true/false question as stored: a correction only for a false statement, and none that just repeats it. */
function tidyTrueFalse(question: TrueFalseQuestion): TrueFalseQuestion | null {
  const correction = question.answer.correction?.trim();
  if (question.answer.value || !correction) return { ...question, answer: { value: question.answer.value } };
  // "False" with a "true version" identical to the statement contradicts itself.
  if (normalizeText(correction) === normalizeText(question.prompt)) return null;
  return { ...question, answer: { value: false, correction } };
}

/** The answer a question asks for, when it is one term or option ("Chlorophyll"): two questions with the same one test the same thing. */
function answerKey(question: GeneratedQuestion): string | null {
  if (question.type === "multiple_choice") return matchWords(question.options.find((option) => option.id === question.answer.option_id)?.text ?? "").join(" ") || null;
  if (question.type === "identification" || question.type === "fill_blank") return matchWords(question.answer.accepted[0] ?? "").join(" ") || null;
  return null;
}

/**
 * Whether two questions are the same question: nearly the same words (a true/false pair that differs in one
 * detail counts, since one gives the other away), or the same type asking for the same answer.
 */
function sameQuestion(a: GeneratedQuestion, b: GeneratedQuestion): boolean {
  const similar = overlap(a.prompt, b.prompt);
  if (similar >= (a.type === "true_false" && b.type === "true_false" ? 0.6 : 0.8)) return true;
  // A statement asked twice (on its own as true/false, or in two two-statement questions) gives itself away.
  const statementsOf = (question: GeneratedQuestion) => (question.type === "two_statement" ? question.statements.map((statement) => statement.text) : question.type === "true_false" ? [question.prompt] : []);
  if ((a.type === "two_statement" || b.type === "two_statement") && statementsOf(a).some((left) => statementsOf(b).some((right) => overlap(left, right) >= 0.6))) return true;
  const key = answerKey(a);
  return key !== null && a.type === b.type && key === answerKey(b);
}

export type FinalizeContext = {
  /** The material the questions must come from: their quotes are checked against it, and named answers must be in it. */
  material?: MaterialText;
  /** Questions of the student's earlier quizzes on this material: a near repeat is used only when nothing new is left. */
  previous?: string[];
};

/**
 * Validates and tidies the model output, then trims it to the requested count:
 * - drops questions whose answer doesn't fit their type, and duplicates (in any script);
 * - with the material: drops a question whose supporting quote isn't in it (a made-up source), replacing a
 *   loosely quoted one with the material's own sentence, and an identification or fill-in question whose
 *   answer isn't a term the material uses;
 * - keeps near repeats of earlier quizzes for last.
 */
export function finalizeQuestions(questions: GeneratedQuestion[], config: QuizConfig, context: FinalizeContext = {}): GeneratedQuestion[] {
  const kept: GeneratedQuestion[] = [];
  for (const generated of questions) {
    if (matchWords(generated.prompt).length === 0) continue;
    let question =
      generated.type === "multiple_choice"
        ? tidyChoiceQuestion(generated)
        : generated.type === "true_false"
          ? tidyTrueFalse(generated)
          : generated.type === "two_statement"
            ? tidyTwoStatement(generated)
            : generated;
    if (!question) continue;
    if (question.type === "fill_blank" && !/_{2,}/.test(question.prompt)) continue;
    if (context.material) {
      const quote = context.material.ground(question.source_excerpt ?? "");
      if (!quote) continue;
      question = { ...question, source_excerpt: quote };
      if ((question.type === "identification" || question.type === "fill_blank") && !question.answer.accepted.some((term) => context.material?.has(term))) continue;
    }
    const candidate = question;
    if (kept.some((other) => sameQuestion(other, candidate))) continue;
    kept.push(candidate);
  }
  // Only the types the student chose: a quiz short of questions says so (populateQuiz) rather than
  // filling up with a type they didn't ask for. New questions come before repeats of earlier quizzes.
  const wanted = new Set(config.questionTypes);
  const chosen = kept.filter((question) => wanted.has(question.type));
  const repeats = new Set(chosen.filter((question) => (context.previous ?? []).some((prompt) => overlap(prompt, question.prompt) >= 0.8)));
  const pool = [...chosen.filter((question) => !repeats.has(question)), ...chosen.filter((question) => repeats.has(question))];
  // Take each type's planned share first, so a mixed quiz really contains every
  // selected type even when the model over-produces the first ones, then fill
  // any shortfall with the rest; the model's order (types interleaved) is kept.
  const picked = new Set<GeneratedQuestion>();
  for (const item of distributeQuestions(config.questionCount, config.questionTypes)) {
    for (const question of pool.filter((candidate) => candidate.type === item.type).slice(0, item.count)) picked.add(question);
  }
  for (const question of pool) {
    if (picked.size >= config.questionCount) break;
    picked.add(question);
  }
  return pool.filter((question) => picked.has(question)).slice(0, config.questionCount);
}

/** Generates quiz questions of the configured types from the material chunks. */
export async function generateQuiz(
  materialTitle: string,
  chunks: AnalysisChunkInput[],
  config: QuizConfig,
  student: StudentContext,
  adaptive: AdaptiveTargets | null = null,
  options: { previous?: string[]; knownConcepts?: string[] } = {},
): Promise<GenerateQuizResult> {
  const provider = getAiProvider("strong");
  // A long material is cut to the quiz's topic first, or leans toward the student's weak concepts.
  const focus = config.focus ? { text: config.focus } : adaptive?.focusConcepts.length ? { text: adaptive.focusConcepts.join(", "), share: 0.5 } : null;
  const { transcript, coverageRatio, focused } = buildTranscript(chunks, undefined, focus);
  // The latest earlier questions, short, so the model can steer clear of them.
  const previous = (options.previous ?? []).slice(0, 25).map((prompt) => (prompt.length > 160 ? `${prompt.slice(0, 157)}…` : prompt).replace(/\s+/g, " "));
  const plan = distributeQuestions(config.questionCount, config.questionTypes);
  const difficulty: QuestionDifficulty | "mixed" | "adaptive" = config.difficulty;
  const difficultyRule =
    difficulty === "adaptive"
      ? adaptive && adaptive.targets.length
        ? `adaptive — use these per-concept targets (advanced = hard with no hints or scaffolding): ${adaptive.targets.map((target) => `${target.concept}: ${target.difficulty}`).join("; ")}; concepts without a target: ${adaptive.fallback ?? "medium"}`
        : "spread easy, medium and hard across the set (no history yet for this material)"
      : difficulty === "mixed"
        ? "spread easy, medium and hard across the set"
        : `"${difficulty}" for every question`;

  const system = `You are RevTaw's quiz writer. You write exam-quality questions strictly from a student's uploaded material.

Question type rules:
${QUESTION_TYPE_IDS.filter((type) => config.questionTypes.includes(type))
  .map((type) => `- ${type} (${QUESTION_TYPE_BY_ID[type].name}): ${TYPE_RULES[type]}`)
  .join("\n")}

${DIFFICULTY_RULES}

Quality rules:
- Every question must be answerable from the material alone; the correct answer must be explicitly supported by it. Never invent facts. If the material can't support the requested count, write fewer questions.
- No duplicate or near-duplicate questions (two questions that test the same fact are duplicates); cover different parts of the material. No trivia about formatting or page numbers.
- Questions must be unambiguous with exactly one defensible answer (or one model answer for open types). The wording (grammar, a repeated word, "a"/"an") must not give the answer away, and no question may answer another.
- "explanation": 1-3 sentences on why the correct answer is right, citing the material in plain words.
- "concept": the 1-4 word concept the question tests (reuse the same wording for the same concept; when the message lists the material's concept names, a question on one of them uses that name, and only a concept not listed gets a new one).
- "source_excerpt": a short verbatim quote (max 300 chars) copied exactly from the material that supports the answer.
- "difficulty": ${difficultyRule}.
${adaptive?.focusConcepts.length ? `- Give about 40% of the questions to these concepts the student struggles with: ${adaptive.focusConcepts.join(", ")}; cover the rest of the material with the remainder.` : ""}
- Keep the material's language and terminology. Write for a student, clearly.
- Respond with a single JSON object matching the schema. No commentary.`;

  const user = `Material title: ${materialTitle}
Student: ${studentLine(student)}
${config.focus ? `Focus only on this topic/chapter if the material covers it: ${config.focus}\n` : ""}${knownConceptsLine(options.knownConcepts ?? [])}${coverageNote(coverageRatio, focused)}${previous.length ? `The student's earlier quizzes on this material already asked these; write different questions (other facts, or the same idea from a new angle):\n${previous.map((prompt) => `- ${prompt}`).join("\n")}\n` : ""}
Plan (produce exactly these counts, ${config.questionCount} questions in total):
${plan.map((item) => `- ${item.type}: ${item.count}`).join("\n")}

JSON schema:
{
  "title": string (max 160, e.g. "${materialTitle} — Practice Quiz"),
  "questions": [
    {
      "type": one of ${config.questionTypes.map((type) => `"${type}"`).join(", ")},
      "difficulty": "easy" | "medium" | "hard",
      "prompt": string,
      "options": [{"id": "a", "text": "...", "why": "..."}, ...] (multiple_choice only, exactly four),
      "statements": [{"text": "...", "is_true": boolean, "why": "..."}, {...}] (two_statement only, exactly two),
      "answer": object as described in the type rules (none for two_statement),
      "explanation": string,
      "concept": string,
      "source_excerpt": string
    }
  ]
}

<material>
${transcript}
</material>`;

  const result = await generateJson(provider, quizResponseSchema, {
    task: "generate_quiz",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 8000,
    temperature: 0.4,
  });

  return {
    title: clampTitle(result.data.title),
    questions: finalizeQuestions(result.data.questions, config, { material: new MaterialText(chunks.map((chunk) => chunk.content)), previous: options.previous }),
    provider: result.raw.provider,
    model: result.raw.model,
    coverageRatio,
    focused,
  };
}
