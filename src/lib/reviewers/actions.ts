"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { SECTION_CONTENT_MAX } from "@/lib/reviewers/generate";
import { routes } from "@/lib/routes";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type ReviewerActionResult = { ok: true } | { ok: false; message: string };

const uuid = z.uuid();
const sectionSchema = z.object({
  sectionId: uuid,
  heading: z.string().trim().min(1, "Give the section a heading.").max(200, "Headings are limited to 200 characters."),
  content: z.string().trim().min(1, "The section cannot be empty.").max(SECTION_CONTENT_MAX, "This section is too long."),
});

function revalidate(reviewerId?: string) {
  revalidatePath(routes.notes);
  if (reviewerId) revalidatePath(`${routes.notes}/${reviewerId}`);
}

/** Saves a student's manual edit of a section. */
export async function updateReviewerSectionAction(input: {
  sectionId: string;
  heading: string;
  content: string;
}): Promise<ReviewerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsed = sectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the section." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviewer_sections")
    .update({ heading: parsed.data.heading, content: parsed.data.content, edited_at: new Date().toISOString() })
    .eq("id", parsed.data.sectionId)
    .select("reviewer_id")
    .maybeSingle();
  if (error || !data) {
    console.error("reviewer_sections: update failed", error?.message);
    return { ok: false, message: "The section could not be saved. Please try again." };
  }
  revalidate(data.reviewer_id);
  return { ok: true };
}

export async function renameReviewerAction(reviewerId: string, title: string): Promise<ReviewerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsed = z.object({ reviewerId: uuid, title: z.string().trim().min(1).max(160) }).safeParse({ reviewerId, title });
  if (!parsed.success) return { ok: false, message: "Enter a title of up to 160 characters." };

  const supabase = await createClient();
  const { error } = await supabase.from("reviewers").update({ title: parsed.data.title }).eq("id", parsed.data.reviewerId);
  if (error) return { ok: false, message: "The title could not be saved." };
  revalidate(parsed.data.reviewerId);
  return { ok: true };
}

export async function deleteReviewerAction(reviewerId: string): Promise<ReviewerActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsed = uuid.safeParse(reviewerId);
  if (!parsed.success) return { ok: false, message: "Invalid reviewer." };

  const supabase = await createClient();
  const { error } = await supabase.from("reviewers").delete().eq("id", parsed.data);
  if (error) return { ok: false, message: "The reviewer could not be deleted." };
  revalidate();
  return { ok: true };
}

export async function markReviewerOpenedAction(reviewerId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const parsed = uuid.safeParse(reviewerId);
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.from("reviewers").update({ last_opened_at: new Date().toISOString() }).eq("id", parsed.data);
}
