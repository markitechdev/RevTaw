import "server-only";

import { z } from "zod";

import { getMasterySummary } from "@/lib/adaptive/engine";
import { countDueCards } from "@/lib/flashcards/queries";
import { completeSession, createSession, loadSession, SessionError, updateSessionState, type SessionSummary, parseSessionSummary } from "@/lib/study/sessions";
import type { Json, SessionGoal } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Smart Study (spec "flagship feature"): RevTaw composes a session from the
 * student's data instead of asking for a method. A smart session is a
 * parent `study_sessions` row whose `state.plan` lists blocks; each block
 * runs as an ordinary child session that carries `state.parentId`.
 */

export const smartBlockSchema = z.object({
  key: z.string(),
  method: z.enum(["error_review", "active_recall", "feynman", "spaced_repetition", "practice_testing", "pomodoro"]),
  minutes: z.number().int().min(1).max(240),
  reason: z.string().max(400),
  concepts: z.array(z.string().max(120)).max(8),
  status: z.enum(["pending", "in_progress", "done", "skipped"]).default("pending"),
  childSessionId: z.string().nullable().default(null),
  questionCount: z.number().int().min(3).max(50).optional(),
});

export type SmartBlock = z.infer<typeof smartBlockSchema>;

export const smartPlanSchema = z.object({
  blocks: z.array(smartBlockSchema).min(1).max(8),
  materialId: z.string().nullable(),
  minutes: z.number().int().min(1).max(480),
});

export type SmartPlan = z.infer<typeof smartPlanSchema>;

export function parseSmartPlan(value: unknown): SmartPlan | null {
  const parsed = smartPlanSchema.safeParse((value as { plan?: unknown } | null)?.plan ?? value);
  return parsed.success ? parsed.data : null;
}

/** Builds the block list for the available minutes from mastery, mistakes and due cards. */
function mostCommonMaterial(rows: Array<{ concept: { material_id: string | null } | null }>): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = row.concept?.material_id;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export async function planSmartSession(input: { materialId: string | null; minutes: number; openMistakes: number }): Promise<SmartPlan> {
  const [summary, dueCards] = await Promise.all([getMasterySummary(input.materialId ? { materialId: input.materialId } : {}), countDueCards()]);
  // "No specific material" means "let RevTaw pick": use the material the weak concepts come from.
  const materialId = input.materialId ?? mostCommonMaterial([...summary.weak, ...summary.learning, ...summary.misconceptions, ...summary.dueForReview]);
  const total = Math.max(5, input.minutes);
  let remaining = total;
  const blocks: SmartBlock[] = [];
  const names = (rows: typeof summary.weak) => rows.slice(0, 4).map((row) => row.concept?.name ?? "concept");
  const take = (minutes: number) => {
    const granted = Math.min(remaining, minutes);
    remaining -= granted;
    return granted;
  };

  if (input.openMistakes > 0 && total >= 10) {
    const minutes = take(Math.max(5, Math.min(10, Math.round(total * 0.2))));
    if (minutes >= 3) {
      blocks.push({
        key: "mistakes",
        method: "error_review",
        minutes,
        reason: `${input.openMistakes} open mistake${input.openMistakes === 1 ? "" : "s"} in your notebook — retesting them first clears the errors that keep repeating.`,
        concepts: [],
        status: "pending",
        childSessionId: null,
      });
    }
  }

  if (materialId) {
    const focus = [...summary.weak, ...summary.learning];
    const minutes = take(Math.max(5, Math.round(total * (blocks.length ? 0.3 : 0.4))));
    if (minutes >= 3) {
      blocks.push({
        key: "recall",
        method: "active_recall",
        minutes,
        reason:
          focus.length > 0
            ? `${names(focus).join(", ")} ${focus.length === 1 ? "is" : "are"} below mastery; pulling the answers from memory raises them fastest.`
            : "No history on this material yet, so a recall pass tells RevTaw which concepts need work.",
        concepts: names(focus),
        status: "pending",
        childSessionId: null,
      });
    }
  }

  if (summary.misconceptions.length > 0 && remaining >= 8 && materialId) {
    const minutes = take(Math.max(8, Math.round(total * 0.25)));
    blocks.push({
      key: "feynman",
      method: "feynman",
      minutes,
      reason: `You were confident but wrong on ${names(summary.misconceptions).join(", ")} — explaining them to a beginner surfaces the misconception.`,
      concepts: names(summary.misconceptions),
      status: "pending",
      childSessionId: null,
    });
  }

  if (dueCards > 0 && remaining >= 5) {
    const minutes = take(Math.max(5, Math.min(15, Math.ceil(dueCards / 4))));
    blocks.push({
      key: "cards",
      method: "spaced_repetition",
      minutes,
      reason: `${dueCards} flashcard${dueCards === 1 ? " is" : "s are"} due; reviewing on time is what makes spaced repetition work.`,
      concepts: [],
      status: "pending",
      childSessionId: null,
    });
  }

  if (remaining >= 5 && materialId) {
    const minutes = take(remaining);
    blocks.push({
      key: "test",
      method: "practice_testing",
      minutes,
      reason: summary.total > 0 ? "A short adaptive test at the end checks whether today's work holds under exam conditions and updates your mastery." : "A short test gives RevTaw its first measurement of every concept in this material.",
      concepts: [],
      status: "pending",
      childSessionId: null,
      questionCount: Math.max(5, Math.min(20, Math.round(minutes / 1.5))),
    });
  } else if (remaining >= 5 && blocks.length === 0) {
    blocks.push({
      key: "focus",
      method: "pomodoro",
      minutes: take(remaining),
      reason: "Nothing is due and no material was chosen, so this is a plain focus block.",
      concepts: [],
      status: "pending",
      childSessionId: null,
    });
  }

  if (blocks.length === 0) {
    blocks.push(
      materialId
        ? { key: "recall", method: "active_recall", minutes: total, reason: "A short recall pass to get started.", concepts: [], status: "pending", childSessionId: null }
        : { key: "focus", method: "pomodoro", minutes: total, reason: "No material was chosen, so this is a plain focus block.", concepts: [], status: "pending", childSessionId: null },
    );
  }

  return { blocks, materialId, minutes: total };
}

export async function startSmartSession(userId: string, input: { materialId: string | null; goal: SessionGoal | null; minutes: number; materialTitle: string | null; openMistakes: number }): Promise<{ sessionId: string }> {
  const supabase = await createClient();
  const plan = await planSmartSession({ materialId: input.materialId, minutes: input.minutes, openMistakes: input.openMistakes });
  let materialTitle = input.materialTitle;
  if (!materialTitle && plan.materialId) {
    const { data: material } = await supabase.from("materials").select("title").eq("id", plan.materialId).maybeSingle();
    materialTitle = material?.title ?? null;
  }
  const { id } = await createSession(supabase, userId, {
    method: "smart_study",
    materialId: plan.materialId,
    goal: input.goal,
    plannedMinutes: input.minutes,
    title: materialTitle ? `${materialTitle} — Smart Study` : "Smart Study",
    state: { plan },
  });
  return { sessionId: id };
}

export type SmartSessionView = {
  plan: SmartPlan;
  blocks: Array<SmartBlock & { childStatus: string | null; childSummary: SessionSummary | null }>;
  nextBlockKey: string | null;
};

/** Reads the plan and reconciles block status with the child sessions. */
export async function getSmartSessionView(sessionId: string): Promise<SmartSessionView | null> {
  const supabase = await createClient();
  const session = await loadSession(supabase, sessionId);
  const plan = parseSmartPlan(session.state);
  if (!plan) return null;
  const { data: children } = await supabase
    .from("study_sessions")
    .select("id, method, status, summary, started_at")
    .contains("state", { parentId: sessionId })
    .limit(50);
  const { data: reviews } = await supabase
    .from("study_sessions")
    .select("id, status, summary, started_at")
    .in("method", ["flashcards", "spaced_repetition"])
    .gte("started_at", session.started_at)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(5);

  const byId = new Map((children ?? []).map((child) => [child.id, child]));
  const blocks = plan.blocks.map((block) => {
    let status = block.status;
    let childStatus: string | null = null;
    let childSummary: SessionSummary | null = null;
    if (block.method === "spaced_repetition") {
      const review = reviews?.[0];
      if (review) {
        status = "done";
        childStatus = review.status;
        childSummary = parseSessionSummary(review.summary);
      }
    } else if (block.childSessionId) {
      const child = byId.get(block.childSessionId);
      if (child) {
        childStatus = child.status;
        childSummary = parseSessionSummary(child.summary);
        status = child.status === "in_progress" ? "in_progress" : "done";
      }
    }
    return { ...block, status, childStatus, childSummary };
  });
  const next = blocks.find((block) => block.status === "pending" || block.status === "in_progress") ?? null;
  return { plan, blocks, nextBlockKey: next?.key ?? null };
}

/** Records that a block started as the given child session. */
export async function markSmartBlock(sessionId: string, key: string, patch: { childSessionId?: string | null; status: SmartBlock["status"] }): Promise<void> {
  const supabase = await createClient();
  const session = await loadSession(supabase, sessionId);
  const plan = parseSmartPlan(session.state);
  if (!plan) throw new SessionError("This session has no plan.", 400);
  const blocks = plan.blocks.map((block) => (block.key === key ? { ...block, ...patch } : block));
  await updateSessionState(supabase, sessionId, { plan: { ...plan, blocks } as unknown as Json });
}

/** Closes the smart session with the combined summary of its blocks. */
export async function completeSmartSession(sessionId: string): Promise<SessionSummary> {
  const supabase = await createClient();
  const view = await getSmartSessionView(sessionId);
  if (!view) throw new SessionError("This session has no plan.", 400);
  const summaries = view.blocks.map((block) => block.childSummary).filter((summary): summary is SessionSummary => Boolean(summary));
  const answered = summaries.reduce((sum, summary) => sum + summary.questionsAnswered, 0);
  const correct = summaries.reduce((sum, summary) => sum + summary.correct, 0);
  const weak = [...new Set(summaries.flatMap((summary) => summary.weakConcepts))];
  const strong = [...new Set(summaries.flatMap((summary) => summary.strongConcepts))].filter((name) => !weak.includes(name));
  const focus = summaries.reduce((sum, summary) => sum + summary.durationSeconds, 0);
  const done = view.blocks.filter((block) => block.status === "done").length;
  return completeSession(supabase, sessionId, {
    focusSeconds: focus,
    topics: [...new Set(summaries.flatMap((summary) => summary.topics))],
    questionsAnswered: answered,
    correct,
    incorrect: answered - correct,
    weakConcepts: weak,
    strongConcepts: strong,
    suggestedNext:
      done === 0
        ? "No block was completed. Try a shorter smart session so the first block is easy to finish."
        : weak.length > 0
          ? `${weak.slice(0, 2).join(" and ")} still need${weak.length === 1 ? "s" : ""} work — tomorrow's smart session will start there.`
          : "Everything you practised today held up. Let spaced repetition carry it; come back when cards are due.",
    nextReviewAt: summaries.map((summary) => summary.nextReviewAt).filter((value): value is string => Boolean(value)).sort()[0] ?? null,
    extra: { blocksDone: done, blocksTotal: view.blocks.length },
    abandoned: done === 0,
  });
}
