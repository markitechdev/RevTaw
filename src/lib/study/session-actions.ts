"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { refreshMastery } from "@/lib/adaptive/engine";
import { routes } from "@/lib/routes";
import { actionFailure, revalidateStudy, uuid, type StudyActionResult } from "@/lib/study/action-helpers";
import { deleteSession, endSession, renameSession } from "@/lib/study/manage";
import { getCurrentUser } from "@/lib/supabase/server";
import { TITLE_MAX } from "@/lib/text/clamp";

/**
 * Rename, end and delete for unfinished sessions (Study's "Continue where you left off" and Home). Each one
 * checks the student, validates its input and works on the student's own session only (manage.ts); the
 * answer carries the session's id (and new title), never a database row. Revalidating Study and Home
 * refreshes the lists and counts that show the session.
 */

const sessionTitle = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .refine((value) => value.length > 0, "Give the session a name.")
  .refine((value) => Array.from(value).length <= TITLE_MAX, `Keep the name to ${TITLE_MAX} characters or fewer.`);

export async function renameSessionAction(input: { sessionId: string; title: string }): Promise<StudyActionResult<{ id: string; title: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.object({ sessionId: uuid, title: sessionTitle }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the name." };
  try {
    const data = await renameSession(user.id, parsed.data.sessionId, parsed.data.title);
    revalidateStudy(data.id);
    return { ok: true, data };
  } catch (error) {
    return actionFailure(error, "We couldn't rename this session. Please try again.");
  }
}

export async function endSessionAction(sessionId: string): Promise<StudyActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = uuid.safeParse(sessionId);
  if (!parsed.success) return { ok: false, message: "Invalid session." };
  try {
    const data = await endSession(user.id, parsed.data);
    revalidateStudy(data.id);
    return { ok: true, data };
  } catch (error) {
    return actionFailure(error, "We couldn't end this session. Please try again.");
  }
}

export async function deleteSessionAction(sessionId: string): Promise<StudyActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = uuid.safeParse(sessionId);
  if (!parsed.success) return { ok: false, message: "Invalid session." };
  try {
    const { id, conceptIds } = await deleteSession(user.id, parsed.data);
    // The deleted answers counted toward these concepts' mastery: work it out again without them, after the response.
    if (conceptIds.length > 0) after(() => refreshMastery(conceptIds));
    revalidateStudy();
    return { ok: true, data: { id } };
  } catch (error) {
    return actionFailure(error, "We couldn't delete this session. Please try again.");
  }
}
