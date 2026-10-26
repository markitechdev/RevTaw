import type { ReviewerKind } from "@/lib/supabase/database.types";

export type ReviewerKindInfo = {
  id: ReviewerKind;
  name: string;
  description: string;
  /** Guidance the generator follows for this kind. */
  guidance: string;
  /** Fixed section headings, when the format prescribes them. */
  fixedSections?: string[];
};

/** Reviewer formats a material can be turned into (spec §21). */
export const REVIEWER_KINDS: ReadonlyArray<ReviewerKindInfo> = [
  {
    id: "complete",
    name: "Complete Reviewer",
    description: "Full study notes covering every topic in order, with explanations, and examples where the material gives them.",
    guidance:
      "Write one section per main topic in the material's order. Each section explains the topic thoroughly in plain language, includes definitions, key facts, formulas with meaning, worked examples when present, and ends with a 'Remember' line of the single most testable point.",
  },
  {
    id: "summary",
    name: "Concise Summary",
    description: "The whole material condensed to what matters, readable in a few minutes.",
    guidance:
      "Produce up to 6 short sections, fewer for a short material. Keep the total under 600 words. Prefer tight paragraphs over lists; every sentence must carry a fact from the material.",
  },
  {
    id: "bullet_notes",
    name: "Bullet Notes",
    description: "Scannable bullet points grouped by topic.",
    guidance:
      "One section per topic. Content is a markdown bullet list; each bullet is one fact, definition or step, at most two lines. Use nested bullets for sub-points.",
  },
  {
    id: "key_concepts",
    name: "Key Concepts",
    description: "Each important concept explained on its own, with why it matters.",
    guidance:
      "One section per key concept the material explains (up to 15 sections, fewer for a short material). Each section: a one-sentence definition in bold, a short explanation, an example or application from the material if it gives one, and a common confusion to avoid if the material supports it.",
  },
  {
    id: "definitions",
    name: "Definitions",
    description: "A glossary of terms exactly as the material defines them.",
    guidance:
      "Group terms into sections by topic. Content is a list where each item is '**Term** — definition' using the material's wording. Do not invent definitions for terms the material does not define.",
  },
  {
    id: "formula_sheet",
    name: "Formula Sheet",
    description: "Every formula with variables explained and when to use it.",
    guidance:
      "One section per topic that contains formulas. For each formula: the formula in a code span, what each symbol means and when to use it as far as the material says (write 'not stated in the material' rather than guessing), and units if stated. If the material has no formulas, produce one section explaining that and listing the quantitative facts it does contain instead.",
  },
  {
    id: "qa",
    name: "Q&A",
    description: "Likely questions with model answers for self-testing.",
    guidance:
      "One section per topic. Content alternates '**Q:** question' and '**A:** answer' pairs (up to 8 per section, as many as the material supports), ranging from recall to understanding. Answers must be fully supported by the material.",
  },
  {
    id: "cornell",
    name: "Cornell Notes",
    description: "Cue column, main notes and summary — the classic layout.",
    guidance:
      "Produce exactly three sections titled 'Cue Column', 'Main Notes' and 'Summary'. Cue Column: questions and keywords, one per line as a bullet list. Main Notes: detailed notes grouped by topic with bold topic labels. Summary: 3-5 sentences condensing the lesson.",
    fixedSections: ["Cue Column", "Main Notes", "Summary"],
  },
  {
    id: "cheat_sheet",
    name: "Cheat Sheet",
    description: "The densest one-page reference: facts, formulas, lists.",
    guidance:
      "Dense and compact. Up to 8 sections with short bullet lists, abbreviations are fine, no full sentences needed. Include every formula, number, date and list from the material.",
  },
  {
    id: "exam_reviewer",
    name: "Exam Reviewer",
    description: "Organized by what is most likely to be examined, with traps and tips.",
    guidance:
      "Order sections from most to least examinable. Each section: the core points to know, likely question forms, common traps or confusions when the material points them out, and a quick self-check question with the answer.",
  },
];

export const REVIEWER_KIND_BY_ID: Record<ReviewerKind, ReviewerKindInfo> = Object.fromEntries(
  REVIEWER_KINDS.map((kind) => [kind.id, kind]),
) as Record<ReviewerKind, ReviewerKindInfo>;

export const REVIEWER_KIND_IDS = REVIEWER_KINDS.map((kind) => kind.id) as [ReviewerKind, ...ReviewerKind[]];
