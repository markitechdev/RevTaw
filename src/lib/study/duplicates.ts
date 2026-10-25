import "server-only";

import { reviewResumeHref } from "@/lib/flashcards/resume";
import { rateLimit, releaseRateLimit } from "@/lib/rate-limit";
import { routes } from "@/lib/routes";
import type { StudyMethodId } from "@/lib/study/methods";
import type { SessionDuplicate } from "@/lib/study/session-duplicate";
import { SessionError } from "@/lib/study/sessions";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type { SessionDuplicate } from "@/lib/study/session-duplicate";

/**
 * One unfinished copy of a session at a time, unless the student asks for another (Study, "Continue where
 * you left off"). Before a session is created, the server looks for the student's unfinished sessions like
 * it: the same method on the same material and, for a few methods, the same deck and review mode, routine,
 * plan length or timer topic. Those are what a session's title is made of, so two copies would look the
 * same in the list. Blocks of a plan belong to their plan and never count.
 *
 * One copy: the student is asked first (resume it, or start a new one). From `strongWarningAt` copies the
 * warning says how many there are and points to the list. At `maxUnfinishedCopies` no new copy starts, even
 * when asked for. A lock per student and kind of session makes a double click, a second tab or a retried
 * request wait for the start already running instead of racing it to a second copy.
 */
export const SESSION_DUPLICATES = {
  /** From this many unfinished copies, the warning says how many and offers the list instead. */
  strongWarningAt: 2,
  /** With this many unfinished copies, no new copy starts until one is finished, ended or deleted. */
  maxUnfinishedCopies: 5,
  /** The longest a start holds its lock if it never releases it (a crashed request); starts that take long (writing the questions) fit. */
  startLockSeconds: 120,
} as const;

/** What makes two sessions the same, as far as the student can tell them apart. */
export type SessionSignature = {
  method: StudyMethodId;
  /** The material, or null for none. Left out, any material matches: Tamari picks the material of a plan asked for without one, and a review's deck decides its material. */
  materialId?: string | null;
  /** Flashcard reviews: the deck (null for every due card) and the review mode. */
  deckId?: string | null;
  mode?: string | null;
  /** Custom routines. */
  routineId?: string | null;
  /** Tamari's plans: the length is part of the title ("Tamari's 20-Minute Bitaw"). */
  minutes?: number;
  /** Pomodoro: the topic typed in (the material's own title, the default topic, counts as none). */
  topic?: string | null;
};

/** An unfinished session as the check reads it: a few columns and state fields, never the whole row. */
export type CopyRow = {
  id: string;
  title: string;
  method: string;
  material_id: string | null;
  planned_minutes: number | null;
  started_at: string;
  last_active_at: string;
  parent_id: string | null;
  deck_id: string | null;
  mode: string | null;
  routine_id: string | null;
  topic: string | null;
  task_id: string | null;
  material: { title: string } | null;
};

const COPY_COLUMNS =
  "id, title, method, material_id, planned_minutes, started_at, last_active_at, parent_id:state->>parentId, deck_id:state->>deckId, mode:state->>mode, routine_id:state->>routineId, topic:state->>topic, task_id:state->>taskId, material:materials!study_sessions_material_fk(title)";

/** Text compared the way a student reads it: case, spacing and look-alike characters aside. */
export function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function reviewMode(value: string | null | undefined): string {
  return value === "all" || value === "favorites" ? value : "due";
}

/** A Pomodoro's own topic: none when it is just the material's title, which every timer on the material gets. */
function ownTopic(topic: string | null | undefined, materialTitle: string | null | undefined): string {
  const value = normalizeForMatch(topic);
  return value === normalizeForMatch(materialTitle) ? "" : value;
}

/** Whether an unfinished session is a copy of the one about to start. */
export function isCopyOf(signature: SessionSignature, row: Pick<CopyRow, "method" | "material_id" | "planned_minutes" | "parent_id" | "deck_id" | "mode" | "routine_id" | "topic" | "material">): boolean {
  if (row.parent_id) return false;
  if (row.method !== signature.method) return false;
  if (signature.materialId !== undefined && (row.material_id ?? null) !== signature.materialId) return false;
  switch (signature.method) {
    case "flashcards":
      return (row.deck_id ?? null) === (signature.deckId ?? null) && reviewMode(row.mode) === reviewMode(signature.mode);
    case "spaced_repetition":
      return reviewMode(row.mode) === reviewMode(signature.mode);
    case "custom_routine":
      return (row.routine_id ?? null) === (signature.routineId ?? null);
    case "smart_study":
      return signature.minutes === undefined || row.planned_minutes === signature.minutes;
    case "pomodoro":
      return ownTopic(row.topic, row.material?.title) === ownTopic(signature.topic, row.material?.title);
    default:
      return true;
  }
}

/** A stable key for the start lock: the same request twice gives the same key. */
export function signatureKey(signature: SessionSignature): string {
  return [
    signature.method,
    signature.materialId === undefined ? "*" : (signature.materialId ?? "-"),
    signature.deckId ?? "",
    signature.mode ? reviewMode(signature.mode) : "",
    signature.routineId ?? "",
    signature.minutes ?? "",
    normalizeForMatch(signature.topic),
  ].join("|");
}

/** What a start asks for, as a signature (the session builder, Tamari's offers, a planner task). */
export function signatureForStart(input: { method: StudyMethodId; materialId: string | null; plannedMinutes: number; topic?: string | null }): SessionSignature {
  // A plan's length is rounded the way the plan stores it (at least five minutes).
  if (input.method === "smart_study") return { method: input.method, materialId: input.materialId ?? undefined, minutes: Math.max(5, Math.round(input.plannedMinutes)) };
  if (input.method === "pomodoro") return { method: input.method, materialId: input.materialId, topic: input.topic?.trim() || null };
  return { method: input.method, materialId: input.materialId };
}

/** Where an unfinished copy continues: its review page for a flashcard review, else its session page. */
function continueHref(row: CopyRow): string {
  return reviewResumeHref({ id: row.id, method: row.method, status: "in_progress", state: { deckId: row.deck_id, mode: row.mode, taskId: row.task_id } }) ?? `${routes.study}/${row.id}`;
}

/** The student's unfinished copies of a session, the one worked on last first. */
export async function findUnfinishedCopies(supabase: Client, userId: string, signature: SessionSignature): Promise<CopyRow[]> {
  let query = supabase
    .from("study_sessions")
    .select(COPY_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .eq("method", signature.method)
    .order("last_active_at", { ascending: false })
    .limit(100);
  if (signature.materialId === null) query = query.is("material_id", null);
  else if (signature.materialId !== undefined) query = query.eq("material_id", signature.materialId);
  const { data, error } = await query;
  if (error) {
    // The check helps the student; it never stands in the way of studying.
    console.error("study_sessions: duplicate check failed", error.message);
    return [];
  }
  return ((data ?? []) as unknown as CopyRow[]).filter((row) => isCopyOf(signature, row));
}

export function duplicateLevel(count: number): SessionDuplicate["level"] {
  if (count >= SESSION_DUPLICATES.maxUnfinishedCopies) return "limit";
  return count >= SESSION_DUPLICATES.strongWarningAt ? "strong" : "warning";
}

/**
 * Null when the session may start: there is no unfinished copy, or the student asked for another one and the
 * limit is not reached. Otherwise what to tell the student, without starting anything.
 */
export async function checkSessionStart(supabase: Client, userId: string, signature: SessionSignature, allowDuplicate = false): Promise<SessionDuplicate | null> {
  const copies = await findUnfinishedCopies(supabase, userId, signature);
  if (copies.length === 0) return null;
  const level = duplicateLevel(copies.length);
  if (allowDuplicate && level !== "limit") return null;
  const newest = copies[0];
  return {
    duplicate: true,
    duplicateCount: copies.length,
    level,
    existingItem: { id: newest.id, title: newest.title, startedAt: newest.started_at, href: continueHref(newest) },
  };
}

/**
 * Runs a start while holding the student's lock for it (`lockKey`): a second request for the same start,
 * from a double click, another tab or a retry, is turned away until this one is done, so it cannot slip
 * past the check before the first session exists.
 */
export async function withStartLock<T>(userId: string, lockKey: string, start: () => Promise<T>): Promise<T> {
  const key = `session-start:${userId}:${lockKey}`;
  const lock = await rateLimit(key, 1, SESSION_DUPLICATES.startLockSeconds * 1000);
  if (!lock.ok) throw new SessionError("This session is already starting, maybe in another tab. Give it a moment, then find it under Continue where you left off.", 409);
  try {
    return await start();
  } finally {
    await releaseRateLimit(key);
  }
}

/** Checks for unfinished copies and, when there are none (or another was asked for), starts the session, all under the start lock. */
export async function startUnlessDuplicate<T>(supabase: Client, userId: string, signature: SessionSignature, allowDuplicate: boolean, start: () => Promise<T>): Promise<T | SessionDuplicate> {
  return withStartLock(userId, signatureKey(signature), async () => (await checkSessionStart(supabase, userId, signature, allowDuplicate)) ?? start());
}
