import "server-only";

import { completeSmartSession } from "@/lib/adaptive/smart";
import { sessionReviewCounts } from "@/lib/flashcards/service";
import { isPlanMethod, isTestMethod, isTutorMethod } from "@/lib/study/catalog";
import { completePreTesting } from "@/lib/study/flows/pretest";
import { completeItemSession, syncPracticeTesting } from "@/lib/study/service";
import { completeSession, SessionError, suggestNext } from "@/lib/study/sessions";
import type { StudySession } from "@/lib/supabase/database.types";
import { readPages } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";
import { clampTitle } from "@/lib/text/clamp";
import { completeTutorSession } from "@/lib/tutor/service";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * What a student can do with an unfinished session from Study's "Continue where you left off" and Home:
 * rename it, end it where it is (what was answered stays, and it moves to Recent sessions as Stopped), or
 * delete it. Each works on the student's own sessions only: every query filters by the student on top of
 * row-level security, and only ids and titles go back to the page, never a row.
 */

/** A session ended from the list counts the span it was active as studied, up to three hours. */
const MAX_ENDED_FOCUS_SECONDS = 3 * 3600;

function activeSeconds(session: Pick<StudySession, "started_at" | "last_active_at">): number {
  const seconds = Math.round((new Date(session.last_active_at).getTime() - new Date(session.started_at).getTime()) / 1000);
  return Math.max(0, Math.min(seconds, MAX_ENDED_FOCUS_SECONDS));
}

async function loadOwnSession(supabase: Client, userId: string, sessionId: string): Promise<StudySession | null> {
  const { data } = await supabase.from("study_sessions").select("*").eq("id", sessionId).eq("user_id", userId).maybeSingle();
  return data ?? null;
}

/** A plan's blocks that are still in progress (each block is a session with `state.parentId`). */
async function unfinishedBlocks(supabase: Client, userId: string, parentId: string): Promise<StudySession[]> {
  const { data, error } = await supabase.from("study_sessions").select("*").eq("user_id", userId).eq("status", "in_progress").contains("state", { parentId }).limit(20);
  if (error) throw new Error(`study_sessions: blocks failed: ${error.message}`);
  return data ?? [];
}

export async function renameSession(userId: string, sessionId: string, title: string): Promise<{ id: string; title: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("study_sessions").update({ title: clampTitle(title) }).eq("id", sessionId).eq("user_id", userId).select("id, title").maybeSingle();
  if (error) throw new Error(`study_sessions: rename failed: ${error.message}`);
  if (!data) throw new SessionError("This session was not found. It may have been deleted.", 404);
  return { id: data.id, title: data.title };
}

/**
 * Ends an unfinished session where it is, the way its own "End" would, but always as stopped early: the
 * answers, ratings and conversation stay, and it moves to Recent sessions. A plan's unfinished blocks end
 * first, then the plan with what they reached. Tamari does not grade a conversation ended this way, and a
 * practice test that was not submitted keeps its attempt in Quizzes. Ending a session that has already
 * ended (another tab got there first) changes nothing.
 */
export async function endSession(userId: string, sessionId: string): Promise<{ id: string }> {
  const supabase = await createClient();
  const session = await loadOwnSession(supabase, userId, sessionId);
  if (!session) throw new SessionError("This session was not found. It may have been deleted.", 404);
  if (session.status === "in_progress") await stopSession(supabase, session, true);
  return { id: session.id };
}

async function stopSession(supabase: Client, session: StudySession, withBlocks: boolean): Promise<void> {
  if (isPlanMethod(session.method)) {
    if (withBlocks) for (const block of await unfinishedBlocks(supabase, session.user_id, session.id)) await stopSession(supabase, block, false);
    if (session.method === "pre_testing") await completePreTesting(session.id, { stopped: true });
    else await completeSmartSession(session.id, { stopped: true });
    return;
  }
  if (isTutorMethod(session.method)) {
    await completeTutorSession(session.id, { stopped: true });
    return;
  }
  if (isTestMethod(session.method)) {
    // Submitted after all: it closes with its score, like opening it would.
    if (await syncPracticeTesting(session)) return;
    await stopUnsubmittedTest(supabase, session);
    return;
  }
  if (session.method === "flashcards" || session.method === "spaced_repetition") {
    await stopReview(supabase, session);
    return;
  }
  if (session.method === "pomodoro") {
    await stopPomodoro(supabase, session);
    return;
  }
  // Recall, Feynman, error review and the other item flows: the answered items make the summary.
  await completeItemSession(session.id, activeSeconds(session), true);
}

async function stopReview(supabase: Client, session: StudySession): Promise<void> {
  const { reviewed, again } = await sessionReviewCounts(supabase, session.id);
  const correct = Math.max(0, reviewed - again);
  await completeSession(supabase, session.id, {
    focusSeconds: activeSeconds(session),
    topics: [],
    questionsAnswered: reviewed,
    correct,
    incorrect: again,
    weakConcepts: [],
    strongConcepts: [],
    suggestedNext: reviewed === 0 ? "Nothing was reviewed. Your cards keep their schedule; review them when they are due." : suggestNext(correct / reviewed, [], "flashcards"),
    nextReviewAt: null,
    abandoned: true,
  });
}

async function stopPomodoro(supabase: Client, session: StudySession): Promise<void> {
  const state = (session.state ?? {}) as { topic?: unknown; completedRounds?: unknown };
  await completeSession(supabase, session.id, {
    // The timer saves its focus time as it runs.
    focusSeconds: session.focus_seconds,
    topics: typeof state.topic === "string" && state.topic ? [state.topic] : [],
    questionsAnswered: 0,
    correct: 0,
    incorrect: 0,
    weakConcepts: [],
    strongConcepts: [],
    suggestedNext: "Start a new Pomodoro when you are ready. A short first round makes it easy to begin.",
    nextReviewAt: null,
    extra: { completedRounds: typeof state.completedRounds === "number" ? state.completedRounds : 0 },
    abandoned: true,
  });
}

async function stopUnsubmittedTest(supabase: Client, session: StudySession): Promise<void> {
  // The attempt's own time so far: the session carries it, as it would after a submit.
  let focus = activeSeconds(session);
  if (session.quiz_attempt_id) {
    const { data: attempt } = await supabase.from("quiz_attempts").select("started_at, updated_at, time_limit_seconds").eq("id", session.quiz_attempt_id).maybeSingle();
    if (attempt) {
      const seconds = Math.round((new Date(attempt.updated_at).getTime() - new Date(attempt.started_at).getTime()) / 1000);
      focus = Math.max(0, Math.min(seconds, attempt.time_limit_seconds ?? MAX_ENDED_FOCUS_SECONDS));
    }
  }
  await completeSession(supabase, session.id, {
    focusSeconds: focus,
    topics: [],
    questionsAnswered: 0,
    correct: 0,
    incorrect: 0,
    weakConcepts: [],
    strongConcepts: [],
    suggestedNext: "This practice test was not submitted, so it has no score. It is still in Quizzes if you want to finish it.",
    nextReviewAt: null,
    abandoned: true,
  });
}

/**
 * Deletes an unfinished session for good: its answers go with it (the database cascades), and so do a plan's
 * unfinished blocks. Blocks already finished stay as sessions of their own; flashcard ratings, a tutor
 * conversation, a practice test's attempt and a planner task stay too, only no longer tied to it. Returns
 * the concepts its answers were about, so their mastery can be worked out again without them. Deleting a
 * session that is already gone (another tab, or not the student's) changes nothing and tells nothing apart.
 */
export async function deleteSession(userId: string, sessionId: string): Promise<{ id: string; conceptIds: string[] }> {
  const supabase = await createClient();
  const session = await loadOwnSession(supabase, userId, sessionId);
  if (!session) return { id: sessionId, conceptIds: [] };
  if (session.status !== "in_progress") throw new SessionError("This session has ended, so it stays under Recent sessions.", 409);
  const blocks = isPlanMethod(session.method) ? await unfinishedBlocks(supabase, userId, session.id) : [];
  const ids = [session.id, ...blocks.map((block) => block.id)];
  const answered = await readPages(
    (from, to) => supabase.from("study_session_items").select("concept_id").in("session_id", ids).not("answered_at", "is", null).not("concept_id", "is", null).order("id").range(from, to),
    5000,
  );
  const { data: deleted, error } = await supabase.from("study_sessions").delete().in("id", ids).eq("user_id", userId).eq("status", "in_progress").select("id");
  if (error) throw new Error(`study_sessions: delete failed: ${error.message}`);
  // Ended in another tab between the read and the delete: it stays.
  if (!(deleted ?? []).some((row) => row.id === session.id)) throw new SessionError("This session has ended, so it stays under Recent sessions.", 409);
  return { id: session.id, conceptIds: [...new Set(answered.map((row) => row.concept_id).filter((id): id is string => Boolean(id)))] };
}
