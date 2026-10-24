import "server-only";

import { cache } from "react";

import type { Page } from "@/lib/pagination";
import type { Reviewer, ReviewerSection } from "@/lib/supabase/database.types";
import { fetchPage } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";

export type ReviewerListItem = Pick<
  Reviewer,
  "id" | "material_id" | "kind" | "title" | "status" | "status_detail" | "created_at" | "updated_at" | "last_opened_at"
> & {
  material: { id: string; title: string; subject: { name: string } | null } | null;
};

const LIST_COLUMNS =
  "id, material_id, kind, title, status, status_detail, created_at, updated_at, last_opened_at, " +
  "material:materials!reviewers_material_fk(id, title, subject:subjects!materials_subject_fk(name))";

/** A material's reviewers (its page lists them all; a material has a handful). */
export async function listReviewers(filters: { materialId?: string } = {}): Promise<ReviewerListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("reviewers")
    .select(LIST_COLUMNS)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (filters.materialId) query = query.eq("material_id", filters.materialId);
  const { data, error } = await query;
  if (error) {
    console.error("reviewers: list failed", error.message);
    return [];
  }
  return (data ?? []) as unknown as ReviewerListItem[];
}

/** One page of the Notes page, most recently updated first (the id breaks ties, so pages never overlap). */
export async function listReviewersPage(page: number, pageSize: number): Promise<Page<ReviewerListItem>> {
  const supabase = await createClient();
  return fetchPage<ReviewerListItem>(
    "reviewers",
    (head) => supabase.from("reviewers").select(head ? "id" : LIST_COLUMNS, { count: "exact", head }).is("archived_at", null).order("updated_at", { ascending: false }).order("id"),
    page,
    pageSize,
  );
}

export type ReviewerDetail = Reviewer & {
  material: { id: string; title: string; subject: { name: string } | null } | null;
  sections: Pick<ReviewerSection, "id" | "position" | "heading" | "content" | "edited_at" | "regenerated_at">[];
};

export const getReviewer = cache(async (reviewerId: string): Promise<ReviewerDetail | null> => {
  const supabase = await createClient();
  const [{ data: reviewer, error }, { data: sections }] = await Promise.all([
    supabase
      .from("reviewers")
      .select("*, material:materials!reviewers_material_fk(id, title, subject:subjects!materials_subject_fk(name))")
      .eq("id", reviewerId)
      .maybeSingle(),
    supabase
      .from("reviewer_sections")
      .select("id, position, heading, content, edited_at, regenerated_at")
      .eq("reviewer_id", reviewerId)
      .order("position"),
  ]);
  if (error) {
    console.error("reviewers: get failed", error.message);
    return null;
  }
  if (!reviewer) return null;
  return { ...(reviewer as unknown as Omit<ReviewerDetail, "sections">), sections: sections ?? [] };
});

export const countReviewers = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("reviewers")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null)
    .eq("status", "ready");
  return count ?? 0;
});
