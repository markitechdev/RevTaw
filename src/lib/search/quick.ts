import "server-only";

import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Type-ahead search for the command menu (UI phase §13). Unlike the full
 * search page (full-text, whole words), this matches titles as you type —
 * "binary tr" finds "Binary trees" — across materials, topics, notes,
 * planner tasks and exams, quizzes, decks and tutor conversations. Runs
 * through the signed-in client, so row-level security keeps it to the
 * student's own rows.
 */

export type QuickResultType = "material" | "topic" | "note" | "task" | "exam" | "quiz" | "deck" | "conversation";

export type QuickResult = {
  type: QuickResultType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

const MAX_QUERY = 80;

export function normalizeQuickQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
}

function likePattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
}

export async function quickSearch(raw: string): Promise<QuickResult[]> {
  const query = normalizeQuickQuery(raw);
  if (query.length < 2) return [];
  const pattern = likePattern(query);
  const supabase = await createClient();

  const [materials, concepts, reviewers, tasks, exams, quizzes, decks, conversations] = await Promise.all([
    supabase.from("materials").select("id, title, subject:subjects!materials_subject_fk(name)").is("archived_at", null).ilike("title", pattern).order("last_opened_at", { ascending: false, nullsFirst: false }).limit(5),
    supabase.from("concepts").select("id, name, material_id, material:materials!concepts_material_fk(title)").ilike("name", pattern).limit(5),
    supabase.from("reviewers").select("id, title, material:materials!reviewers_material_fk(title)").ilike("title", pattern).order("updated_at", { ascending: false }).limit(4),
    supabase.from("study_tasks").select("id, title, scheduled_for, exam_id").in("status", ["pending", "missed"]).ilike("title", pattern).order("scheduled_for").limit(4),
    supabase.from("exams").select("id, title, exam_date").is("archived_at", null).ilike("title", pattern).order("exam_date").limit(3),
    supabase.from("quizzes").select("id, title").ilike("title", pattern).order("updated_at", { ascending: false }).limit(3),
    supabase.from("flashcard_decks").select("id, title, card_count").ilike("title", pattern).order("updated_at", { ascending: false }).limit(3),
    supabase.from("tutor_conversations").select("id, title").ilike("title", pattern).order("updated_at", { ascending: false }).limit(3),
  ]);

  const titleOf = (value: unknown) => (value as { title?: string } | null)?.title ?? null;
  const results: QuickResult[] = [];
  for (const row of materials.data ?? []) results.push({ type: "material", id: row.id, title: row.title, subtitle: (row.subject as unknown as { name: string } | null)?.name ?? "No subject", href: `${routes.materials}/${row.id}` });
  for (const row of concepts.data ?? []) {
    results.push({ type: "topic", id: row.id, title: row.name, subtitle: titleOf(row.material), href: row.material_id ? `${routes.study}?method=active_recall&material=${row.material_id}` : routes.studyMap });
  }
  for (const row of reviewers.data ?? []) results.push({ type: "note", id: row.id, title: row.title, subtitle: titleOf(row.material), href: `${routes.notes}/${row.id}` });
  for (const row of tasks.data ?? []) results.push({ type: "task", id: row.id, title: row.title, subtitle: `Planned for ${row.scheduled_for}`, href: row.exam_id ? `${routes.planner}/${row.exam_id}` : routes.planner });
  for (const row of exams.data ?? []) results.push({ type: "exam", id: row.id, title: row.title, subtitle: `Exam on ${row.exam_date}`, href: `${routes.planner}/${row.id}` });
  for (const row of quizzes.data ?? []) results.push({ type: "quiz", id: row.id, title: row.title, subtitle: "Quiz", href: `${routes.quiz}/${row.id}` });
  for (const row of decks.data ?? []) results.push({ type: "deck", id: row.id, title: row.title, subtitle: `${row.card_count} card${row.card_count === 1 ? "" : "s"}`, href: `${routes.flashcards}/${row.id}` });
  for (const row of conversations.data ?? []) results.push({ type: "conversation", id: row.id, title: row.title, subtitle: "Chat with Tamari", href: `${routes.tutor}/${row.id}` });
  return results;
}
