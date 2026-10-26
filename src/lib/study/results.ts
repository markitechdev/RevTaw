import type { RecallComparison } from "@/lib/study/ai";
import type { MistakeType } from "@/lib/supabase/database.types";

/**
 * Answers Tamari couldn't check (the AI was unavailable). Such an answer is saved without a grade: it counts as
 * answered but neither right nor wrong, nothing goes to the mistake notebook and mastery doesn't move. The
 * student sees the model answer and marks the answer themselves; only that mark is counted, filed (when it is
 * "not yet") and learned from (items.ts selfCheckItem). Pure and client-safe: the flows that store answers
 * and the runners that show them both read it.
 */

export type SelfCheck = "correct" | "incorrect";

/** What goes to the notebook if the student marks the answer "not yet". */
export type PendingMistake = { question: string; correctAnswer: string; explanation: string; errorType?: MistakeType };

/** Kept in the analysis of an unchecked answer, under `ungraded`. */
export type Ungraded = { selfCheck: SelfCheck | null; mistake: PendingMistake | null; retestedMistakeId: string | null };

/** The notebook's explanation for an answer the student marked "not yet" themselves. */
export const SELF_CHECK_EXPLANATION = "You marked this as not yet right after comparing your answer with the model answer.";

export function ungradedOf(analysis: unknown): Ungraded | null {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) return null;
  const value = (analysis as { ungraded?: unknown }).ungraded;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = value as Partial<Ungraded>;
  const mistake = stored.mistake && typeof stored.mistake === "object" && typeof stored.mistake.question === "string" ? stored.mistake : null;
  return {
    selfCheck: stored.selfCheck === "correct" || stored.selfCheck === "incorrect" ? stored.selfCheck : null,
    mistake,
    retestedMistakeId: typeof stored.retestedMistakeId === "string" ? stored.retestedMistakeId : null,
  };
}

/** The analysis of an unchecked answer: what the item carried, plus what the student's mark will settle. */
export function withUngraded(analysis: Record<string, unknown>, pending: { mistake?: PendingMistake | null; retestedMistakeId?: string | null }): Record<string, unknown> {
  const ungraded: Ungraded = { selfCheck: null, mistake: pending.mistake ?? null, retestedMistakeId: pending.retestedMistakeId ?? null };
  return { ...analysis, ungraded };
}

/** What the runners need to know about an unchecked answer: whether (and how) the student marked it. */
export type UngradedView = { selfCheck: SelfCheck | null };

export function ungradedView(analysis: unknown): UngradedView | null {
  const ungraded = ungradedOf(analysis);
  return ungraded ? { selfCheck: ungraded.selfCheck } : null;
}

export type RecallItemResult = {
  /** Tamari's comparison; null when it couldn't check the answer (then `ungraded` is set). */
  comparison: RecallComparison | null;
  /** null while an unchecked answer has no mark from the student. */
  isCorrect: boolean | null;
  ungraded: UngradedView | null;
  modelAnswer: string;
  sourceExcerpt: string | null;
};

type StoredRecallItem = { answered_at: string | null; analysis: unknown; is_correct: boolean | null; model_answer: string | null; source_excerpt: string | null };

/** The stored result of an answered recall item; null while it is unanswered. */
export function recallResultOf(item: StoredRecallItem): RecallItemResult | null {
  if (!item.answered_at) return null;
  const ungraded = ungradedView(item.analysis);
  const analysis = item.analysis as { score?: unknown } | null;
  const comparison = !ungraded && analysis && typeof analysis.score === "number" ? (analysis as unknown as RecallComparison) : null;
  if (!ungraded && !comparison) return null;
  return { comparison, isCorrect: item.is_correct, ungraded, modelAnswer: item.model_answer ?? "", sourceExcerpt: item.source_excerpt };
}
