import "server-only";

import { getSmartSessionView, parseSmartPlan, smartPlanSchema, type SmartBlock, type SmartPlan } from "@/lib/adaptive/smart";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { type Client, type FlowStartInput, type FlowStartResult } from "@/lib/study/items";
import { completeSession, createSession, loadSession, SessionError, sessionTitle, updateSessionState, type SessionSummary } from "@/lib/study/sessions";
import type { Json, StudySession } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Pre-testing / before-and-after assessment (§16): a short diagnostic test
 * before studying, a study block aimed at what the diagnostic exposed, then
 * a post-test on the same concepts — with the improvement displayed. Runs as
 * a plan of three blocks through the smart-session machinery.
 */

export const PRE_TEST_KEYS = { pre: "pre", study: "study", post: "post" } as const;

export type ConceptChange = { concept: string; before: number | null; after: number | null };

/** What the diagnostic found, kept in the parent session's state once the pre-test is submitted. */
export type PreTestState = {
  preScore: number;
  /** Concepts the pre-test covered, in the quiz's words. */
  concepts: string[];
  /** Concepts with a wrong answer in the pre-test: what to pay attention to while studying. */
  attention: string[];
  byConcept: Record<string, number>;
};

export type PostTestState = { postScore: number; byConcept: Record<string, number> };

export type PreTestView = { pretest: PreTestState | null; posttest: PostTestState | null; changes: ConceptChange[]; plan: SmartPlan | null };

function pretestOf(state: unknown): PreTestState | null {
  const value = (state as { pretest?: PreTestState } | null)?.pretest;
  return value && typeof value.preScore === "number" && Array.isArray(value.concepts) ? value : null;
}

function posttestOf(state: unknown): PostTestState | null {
  const value = (state as { posttest?: PostTestState } | null)?.posttest;
  return value && typeof value.postScore === "number" ? value : null;
}

/** The split of the time: a quarter each to the tests, half to studying; the tests ask 4-10 questions. */
export function preTestLayout(minutes: number): { testMinutes: number; studyMinutes: number; questionCount: number } {
  const testMinutes = Math.max(3, Math.round(minutes / 4));
  return { testMinutes, studyMinutes: Math.max(5, minutes - 2 * testMinutes), questionCount: Math.max(4, Math.min(10, Math.round(minutes / 5))) };
}

export async function startPreTesting(supabase: Client, userId: string, input: FlowStartInput): Promise<FlowStartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const { testMinutes, studyMinutes, questionCount } = preTestLayout(input.plannedMinutes);
  const studyMethod: SmartBlock["method"] = input.goal === "understand" ? "feynman" : "active_recall";
  const blocks: SmartBlock[] = [
    { key: PRE_TEST_KEYS.pre, method: "practice_testing", minutes: testMinutes, reason: "A short diagnostic before you study: it shows which concepts need your attention.", concepts: [], status: "pending", childSessionId: null, questionCount, materialId: context.material.id, focus: null },
    { key: PRE_TEST_KEYS.study, method: studyMethod, minutes: studyMinutes, reason: "Study the concepts the pre-test exposed. The focus list fills in once the pre-test is submitted.", concepts: [], status: "pending", childSessionId: null, materialId: context.material.id },
    { key: PRE_TEST_KEYS.post, method: "practice_testing", minutes: testMinutes, reason: "The same concepts again, after studying — the difference is your improvement.", concepts: [], status: "pending", childSessionId: null, questionCount, materialId: context.material.id, focus: null },
  ];
  const plan = smartPlanSchema.parse({ blocks, materialId: context.material.id, minutes: input.plannedMinutes });
  const { id } = await createSession(supabase, userId, {
    method: "pre_testing",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "practice",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("pre_testing", context.material.title),
    state: { plan },
  });
  return { sessionId: id, redirect: `/study/${id}` };
}

/** Accuracy (share of questions right) and per-concept accuracy of a submitted attempt, concept names as the quiz wrote them. */
async function attemptResults(supabase: Client, attemptId: string): Promise<{ score: number; byConcept: Record<string, number>; concepts: string[]; missed: string[] } | null> {
  const { data: attempt } = await supabase.from("quiz_attempts").select("id, status").eq("id", attemptId).maybeSingle();
  if (!attempt || attempt.status !== "submitted") return null;
  const { data: answers } = await supabase
    .from("quiz_answers")
    .select("is_correct, question:quiz_questions!quiz_answers_question_fk(position, concept:concepts!quiz_questions_concept_fk(name))")
    .eq("attempt_id", attempt.id);
  const tally = new Map<string, { correct: number; total: number; position: number }>();
  for (const answer of answers ?? []) {
    const question = answer.question as unknown as { position: number; concept: { name: string } | null } | null;
    const name = question?.concept?.name ?? "General";
    const entry = tally.get(name) ?? { correct: 0, total: 0, position: question?.position ?? 0 };
    entry.total += 1;
    if (answer.is_correct) entry.correct += 1;
    tally.set(name, entry);
  }
  const ordered = [...tally.entries()].sort((a, b) => a[1].position - b[1].position);
  const byConcept = Object.fromEntries(ordered.map(([name, entry]) => [name, Math.round((entry.correct / Math.max(1, entry.total)) * 100)]));
  const score = Math.round((ordered.reduce((sum, [, entry]) => sum + entry.correct, 0) / Math.max(1, ordered.reduce((sum, [, entry]) => sum + entry.total, 0))) * 100);
  return { score, byConcept, concepts: ordered.map(([name]) => name), missed: ordered.filter(([, entry]) => entry.correct < entry.total).map(([name]) => name) };
}

async function attemptIdOf(supabase: Client, childSessionId: string | null): Promise<string | null> {
  if (!childSessionId) return null;
  const { data } = await supabase.from("study_sessions").select("quiz_attempt_id").eq("id", childSessionId).maybeSingle();
  return data?.quiz_attempt_id ?? null;
}

/**
 * Once the pre-test is submitted, records what it found and aims the other
 * two blocks at it: the study block lists the concepts to pay attention to
 * and the post-test stays on the pre-test's concepts. Once the post-test is
 * submitted, records its results too. Runs before the plan is displayed and
 * returns the view of the (updated) state, so the page never shows stale data.
 */
export async function syncPreTestPlan(sessionId: string): Promise<PreTestView> {
  const supabase = await createClient();
  const session = await loadSession(supabase, sessionId);
  const plan = parseSmartPlan(session.state);
  if (session.method !== "pre_testing" || session.status !== "in_progress" || !plan) return getPreTestView(session);
  const patch: Record<string, unknown> = {};
  let blocks = plan.blocks;

  if (!pretestOf(session.state)) {
    const pre = blocks.find((block) => block.key === PRE_TEST_KEYS.pre);
    const results = await attemptResults(supabase, (await attemptIdOf(supabase, pre?.childSessionId ?? null)) ?? "");
    if (results) {
      const attention = results.missed.length ? results.missed : results.concepts.slice(0, 3);
      const pretest: PreTestState = { preScore: results.score, concepts: results.concepts, attention, byConcept: results.byConcept };
      patch.pretest = pretest;
      blocks = blocks.map((block) => {
        if (block.key === PRE_TEST_KEYS.study)
          return {
            ...block,
            concepts: attention.slice(0, 8),
            reason: results.missed.length
              ? `You scored ${results.score}% on the pre-test. Pay attention to ${attention.slice(0, 3).join(", ")}${attention.length > 3 ? ` and ${attention.length - 3} more` : ""} — the study block focuses there.`
              : `You scored ${results.score}% on the pre-test with nothing missed. Use the study block to make it stick before the post-test.`,
          };
        if (block.key === PRE_TEST_KEYS.post) return { ...block, concepts: results.concepts.slice(0, 8), focus: results.concepts.join(", ").slice(0, 400) || null };
        return block;
      });
    }
  }

  if (!posttestOf(session.state)) {
    const post = blocks.find((block) => block.key === PRE_TEST_KEYS.post);
    const results = await attemptResults(supabase, (await attemptIdOf(supabase, post?.childSessionId ?? null)) ?? "");
    if (results) patch.posttest = { postScore: results.score, byConcept: results.byConcept } satisfies PostTestState;
  }

  if (Object.keys(patch).length === 0) return getPreTestView(session);
  const updatedPlan = { ...plan, blocks };
  await updateSessionState(supabase, sessionId, { ...patch, plan: updatedPlan as unknown as Json });
  return getPreTestView({ state: { ...(session.state as Record<string, unknown>), ...patch, plan: updatedPlan } as Json });
}

/** Per-concept before/after accuracy, pre-test concepts first. */
export function conceptChanges(pretest: PreTestState | null, posttest: PostTestState | null): ConceptChange[] {
  if (!pretest) return [];
  const names = [...new Set([...pretest.concepts, ...Object.keys(posttest?.byConcept ?? {})])];
  return names.map((concept) => ({ concept, before: pretest.byConcept[concept] ?? null, after: posttest?.byConcept[concept] ?? null }));
}

export function getPreTestView(session: Pick<StudySession, "state">): PreTestView {
  const pretest = pretestOf(session.state);
  const posttest = posttestOf(session.state);
  return { pretest, posttest, changes: conceptChanges(pretest, posttest), plan: parseSmartPlan(session.state) };
}

/** Closes the pre-testing session with the combined summary and the before-and-after figures (`stopped`: ended early from the list of unfinished sessions). */
export async function completePreTesting(sessionId: string, options: { stopped?: boolean } = {}): Promise<SessionSummary> {
  await syncPreTestPlan(sessionId);
  const supabase = await createClient();
  const session = await loadSession(supabase, sessionId);
  const { pretest, posttest, changes, plan } = getPreTestView(session);
  const view = await getSmartSessionView(sessionId, plan);
  if (!view) throw new SessionError("This session has no plan.", 400);
  const summaries = view.blocks.map((block) => block.childSummary).filter((summary): summary is SessionSummary => Boolean(summary));
  const answered = summaries.reduce((sum, summary) => sum + summary.questionsAnswered, 0);
  const correct = summaries.reduce((sum, summary) => sum + summary.correct, 0);
  const done = view.blocks.filter((block) => block.status === "done").length;
  const improved = changes.filter((change) => change.before !== null && change.after !== null && change.after > change.before).map((change) => change.concept);
  const stillWeak = changes.filter((change) => (change.after ?? change.before ?? 100) < 100).map((change) => change.concept);
  const weak = posttest ? stillWeak : (pretest?.attention ?? [...new Set(summaries.flatMap((summary) => summary.weakConcepts))]);
  const strong = changes.filter((change) => (change.after ?? -1) === 100).map((change) => change.concept);
  const improvement = pretest && posttest ? posttest.postScore - pretest.preScore : null;
  return completeSession(supabase, sessionId, {
    focusSeconds: summaries.reduce((sum, summary) => sum + summary.durationSeconds, 0),
    topics: [...new Set(summaries.flatMap((summary) => summary.topics))],
    questionsAnswered: answered,
    correct,
    incorrect: answered - correct,
    weakConcepts: weak,
    strongConcepts: strong.filter((name) => !weak.includes(name)),
    suggestedNext:
      !pretest
        ? "The pre-test was not submitted. Start again with a shorter session so the diagnostic is quick to finish."
        : !posttest
          ? "The post-test was not taken, so there is no before-and-after yet. Take a practice test on the same concepts tomorrow to measure the gain."
          : improvement !== null && improvement > 0
            ? `Up ${Math.round(improvement)} points after one study block${improved.length ? ` (${improved.slice(0, 2).join(", ")} improved)` : ""}. Schedule a review in three days to check it held.`
            : "No gain yet — the study block did not reach the concepts you missed. Try a Feynman or error-review session on them, then test again.",
    nextReviewAt: summaries.map((summary) => summary.nextReviewAt).filter((value): value is string => Boolean(value)).sort()[0] ?? null,
    extra: { blocksDone: done, blocksTotal: view.blocks.length, ...(pretest ? { preScore: pretest.preScore } : {}), ...(posttest ? { postScore: posttest.postScore } : {}), ...(improvement !== null ? { improvement } : {}), changes },
    abandoned: Boolean(options.stopped) || done === 0,
  });
}
