import "server-only";

import { cache } from "react";

import { listRecentMaterials, type RecentMaterial } from "@/lib/materials/queries";
import { routes } from "@/lib/routes";
import { methodName } from "@/lib/study/catalog";
import { createClient } from "@/lib/supabase/server";

/**
 * "Continue studying" (UI phase §5): the one thing the student was in the
 * middle of. An unfinished study session or quiz from the last three weeks
 * wins, newest first; otherwise the material they opened last.
 */
export type ContinueItem =
  | {
      kind: "session";
      id: string;
      title: string;
      method: string;
      methodLabel: string;
      material: { id: string; title: string } | null;
      answered: number;
      total: number;
      lastActiveAt: string;
      href: string;
    }
  | {
      kind: "quiz";
      id: string;
      title: string;
      material: { id: string; title: string } | null;
      questionCount: number;
      lastActiveAt: string;
      href: string;
    }
  | {
      kind: "material";
      material: RecentMaterial;
      href: string;
    };

const RECENT_WINDOW_MS = 21 * 86_400_000;

export const getContinueItem = cache(async (): Promise<ContinueItem | null> => {
  const supabase = await createClient();
  const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
  const [{ data: sessions }, { data: attempts }, recent] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("id, title, method, items_total, items_correct, items_incorrect, last_active_at, quiz_attempt_id, material:materials!study_sessions_material_fk(id, title)")
      .eq("status", "in_progress")
      .gte("last_active_at", since)
      .order("last_active_at", { ascending: false })
      .limit(1),
    supabase
      .from("quiz_attempts")
      .select("id, quiz_id, question_count, updated_at, quiz:quizzes!quiz_attempts_quiz_fk(title, material:materials!quizzes_material_fk(id, title))")
      .eq("status", "in_progress")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(3),
    listRecentMaterials(5),
  ]);

  type SessionRow = { id: string; title: string; method: string; items_total: number; items_correct: number; items_incorrect: number; last_active_at: string; quiz_attempt_id: string | null; material: { id: string; title: string } | null };
  type AttemptRow = { id: string; quiz_id: string; question_count: number; updated_at: string; quiz: { title: string; material: { id: string; title: string } | null } | null };
  const session = ((sessions ?? []) as unknown as SessionRow[])[0] ?? null;
  // An attempt that belongs to a practice-testing session is resumed through that session.
  const attemptRows = (attempts ?? []) as unknown as AttemptRow[];
  let attempt: AttemptRow | null = null;
  if (attemptRows.length > 0) {
    const { data: owned } = await supabase.from("study_sessions").select("quiz_attempt_id").in("quiz_attempt_id", attemptRows.map((row) => row.id));
    const linked = new Set((owned ?? []).map((row) => row.quiz_attempt_id));
    attempt = attemptRows.find((row) => !linked.has(row.id)) ?? null;
  }

  const sessionAt = session ? new Date(session.last_active_at).getTime() : 0;
  const attemptAt = attempt ? new Date(attempt.updated_at).getTime() : 0;
  if (session && sessionAt >= attemptAt) {
    return {
      kind: "session",
      id: session.id,
      title: session.title,
      method: session.method,
      methodLabel: methodName(session.method),
      material: session.material,
      answered: session.items_correct + session.items_incorrect,
      total: session.items_total,
      lastActiveAt: session.last_active_at,
      href: `${routes.study}/${session.id}`,
    };
  }
  if (attempt) {
    return {
      kind: "quiz",
      id: attempt.id,
      title: attempt.quiz?.title ?? "Quiz",
      material: attempt.quiz?.material ?? null,
      questionCount: attempt.question_count,
      lastActiveAt: attempt.updated_at,
      href: `${routes.quiz}/${attempt.quiz_id}/attempt/${attempt.id}`,
    };
  }
  const material = recent.find((item) => item.last_opened_at) ?? recent[0];
  return material ? { kind: "material", material, href: `${routes.materials}/${material.id}` } : null;
});
