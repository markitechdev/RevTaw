"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { purgeMaterials } from "@/lib/materials/purge";
import { routes } from "@/lib/routes";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/auth";
import {
  folderInputSchema,
  materialIdSchema,
  moveMaterialSchema,
  nameSchema,
  renameMaterialSchema,
  subjectInputSchema,
} from "@/lib/validation/materials";

export type OrganizeResult =
  | { ok: true; id?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

const GENERIC = "That change could not be saved. Please try again.";
const uuid = z.uuid();

function revalidateMaterials(materialId?: string) {
  revalidatePath(routes.materials);
  revalidatePath(routes.dashboard);
  if (materialId) revalidatePath(`${routes.materials}/${materialId}`);
}

function invalid(error: z.ZodError): OrganizeResult {
  return { ok: false, message: "Please check the highlighted fields.", fieldErrors: fieldErrorsFrom(error) };
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export async function renameMaterialAction(materialId: string, title: string): Promise<OrganizeResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsed = renameMaterialSchema.safeParse({ materialId, title });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("materials")
    .update({ title: parsed.data.title })
    .eq("id", parsed.data.materialId);
  if (error) {
    console.error("materials: rename failed", error.message);
    return { ok: false, message: GENERIC };
  }
  revalidateMaterials(parsed.data.materialId);
  return { ok: true };
}

export async function moveMaterialAction(input: {
  materialId: string;
  subjectId: string;
  folderId: string;
  newSubjectName?: string;
  newFolderName?: string;
}): Promise<OrganizeResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsed = moveMaterialSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  let subjectId = parsed.data.subjectId;
  let folderId = parsed.data.folderId;

  if (input.newSubjectName?.trim()) {
    const created = await createSubjectAction(input.newSubjectName);
    if (!created.ok) return { ok: false, message: created.message, fieldErrors: { newSubjectName: created.message } };
    subjectId = created.id ?? null;
    folderId = null;
  }

  if (subjectId && input.newFolderName?.trim()) {
    const created = await createFolderAction(subjectId, input.newFolderName);
    if (!created.ok) return { ok: false, message: created.message, fieldErrors: { newFolderName: created.message } };
    folderId = created.id ?? null;
  }

  if (!subjectId) folderId = null;

  const { error } = await supabase
    .from("materials")
    .update({ subject_id: subjectId, folder_id: folderId })
    .eq("id", parsed.data.materialId);
  if (error) {
    console.error("materials: move failed", error.message);
    return {
      ok: false,
      message: error.code === "23503" ? "That folder does not belong to the chosen subject." : GENERIC,
    };
  }
  revalidateMaterials(parsed.data.materialId);
  return { ok: true };
}

/**
 * Delete (archived = true) moves a material to the Archive, where it can be
 * restored (archived = false) for 30 days before it is deleted permanently.
 * A material whose file is already gone can't be restored.
 */
export async function setMaterialArchivedAction(materialId: string, archived: boolean): Promise<OrganizeResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsed = materialIdSchema.safeParse({ materialId });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", parsed.data.materialId)
    .is("purged_at", null)
    .select("id");
  if (error) {
    console.error("materials: archive failed", error.message);
    return { ok: false, message: GENERIC };
  }
  if (!data || data.length === 0) {
    return { ok: false, message: archived ? "This material no longer exists." : "This material's file was already deleted permanently, so it can't be restored." };
  }
  revalidateMaterials(parsed.data.materialId);
  return { ok: true };
}

/**
 * "Delete permanently" in the Archive: the file, extracted text and analysis
 * go for good now. Reviewers, quizzes, flashcards, memory aids and progress
 * made from the material stay, filed under the same subject and folder.
 */
export async function purgeMaterialAction(materialId: string): Promise<OrganizeResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsed = materialIdSchema.safeParse({ materialId });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: material } = await supabase
    .from("materials")
    .select("id, storage_path, archived_at, purged_at")
    .eq("id", parsed.data.materialId)
    .maybeSingle();
  if (!material) return { ok: false, message: "This material no longer exists." };
  if (!material.archived_at) return { ok: false, message: "Delete it first; it can be deleted permanently from the Archive." };

  if (!material.purged_at || material.storage_path) {
    const finished = await purgeMaterials(supabase, [material]);
    if (finished === 0) return { ok: false, message: "The file could not be deleted. Please try again." };
  }
  revalidateMaterials(material.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Subjects and folders
// ---------------------------------------------------------------------------

export async function createSubjectAction(name: string): Promise<OrganizeResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsed = subjectInputSchema.safeParse({ name });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subjects")
    .insert({ user_id: user.id, name: parsed.data.name })
    .select("id")
    .single();
  if (error || !data) {
    if (isUniqueViolation(error)) return { ok: false, message: "You already have a subject with that name." };
    console.error("subjects: create failed", error?.message);
    return { ok: false, message: GENERIC };
  }
  revalidateMaterials();
  return { ok: true, id: data.id };
}

export async function renameSubjectAction(subjectId: string, name: string): Promise<OrganizeResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsedId = uuid.safeParse(subjectId);
  const parsed = nameSchema.safeParse(name);
  if (!parsedId.success) return { ok: false, message: "Invalid subject." };
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("subjects").update({ name: parsed.data }).eq("id", parsedId.data);
  if (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "You already have a subject with that name." };
    console.error("subjects: rename failed", error.message);
    return { ok: false, message: GENERIC };
  }
  revalidateMaterials();
  return { ok: true };
}

/** Removes a subject and its folders; materials stay and become unfiled. */
export async function deleteSubjectAction(subjectId: string): Promise<OrganizeResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsedId = uuid.safeParse(subjectId);
  if (!parsedId.success) return { ok: false, message: "Invalid subject." };

  const supabase = await createClient();
  const { error } = await supabase.from("subjects").delete().eq("id", parsedId.data);
  if (error) {
    console.error("subjects: delete failed", error.message);
    return { ok: false, message: GENERIC };
  }
  revalidateMaterials();
  return { ok: true };
}

export async function createFolderAction(subjectId: string, name: string): Promise<OrganizeResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsed = folderInputSchema.safeParse({ subjectId, name });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folders")
    .insert({ user_id: user.id, subject_id: parsed.data.subjectId, name: parsed.data.name })
    .select("id")
    .single();
  if (error || !data) {
    if (isUniqueViolation(error)) return { ok: false, message: "That subject already has a folder with this name." };
    console.error("folders: create failed", error?.message);
    return { ok: false, message: GENERIC };
  }
  revalidateMaterials();
  return { ok: true, id: data.id };
}

export async function renameFolderAction(folderId: string, name: string): Promise<OrganizeResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsedId = uuid.safeParse(folderId);
  const parsed = nameSchema.safeParse(name);
  if (!parsedId.success) return { ok: false, message: "Invalid folder." };
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("folders").update({ name: parsed.data }).eq("id", parsedId.data);
  if (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "That subject already has a folder with this name." };
    console.error("folders: rename failed", error.message);
    return { ok: false, message: GENERIC };
  }
  revalidateMaterials();
  return { ok: true };
}

/** Removes a folder; its materials stay in the subject. */
export async function deleteFolderAction(folderId: string): Promise<OrganizeResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const parsedId = uuid.safeParse(folderId);
  if (!parsedId.success) return { ok: false, message: "Invalid folder." };

  const supabase = await createClient();
  const { error } = await supabase.from("folders").delete().eq("id", parsedId.data);
  if (error) {
    console.error("folders: delete failed", error.message);
    return { ok: false, message: GENERIC };
  }
  revalidateMaterials();
  return { ok: true };
}
