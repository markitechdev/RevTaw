"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  errorState,
  formString,
  type ActionState,
} from "@/lib/forms/action-state";
import { acceptedTypeFor } from "@/lib/materials/constants";
import { ownedObjectKey } from "@/lib/materials/purge";
import {
  createUploadTarget,
  materialObjectPath,
  removeMaterialObjects,
  uploadMaterialBytes,
} from "@/lib/materials/storage";
import { rateLimit } from "@/lib/rate-limit";
import { routes } from "@/lib/routes";
import { createClient, getCurrentUser, type CurrentUser } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/auth";
import {
  createFileMaterialSchema,
  createTextMaterialSchema,
  materialIdSchema,
  type CreateFileMaterialInput,
} from "@/lib/validation/materials";

type Client = Awaited<ReturnType<typeof createClient>>;

export type CreateFileMaterialResult =
  | { ok: true; materialId: string; uploadUrl: string; uploadToken: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

const GENERIC_ERROR = "Something went wrong while preparing the upload. Please try again.";

/**
 * Step 1 of a file upload: validates the request, creates the material row and
 * returns a short-lived signed URL the browser uploads the file to directly.
 * The bytes never pass through the Next.js server.
 */
export async function createFileMaterialAction(
  input: CreateFileMaterialInput,
): Promise<CreateFileMaterialResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const limit = await rateLimit(`upload:${user.id}`, 60, 60 * 60_000);
  if (!limit.ok) {
    return { ok: false, message: "You have uploaded a lot recently. Please wait a little before adding more." };
  }

  const parsed = createFileMaterialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const accepted = acceptedTypeFor(parsed.data.filename, parsed.data.mimeType);
  if (!accepted) {
    return { ok: false, message: "That file type is not supported.", fieldErrors: { filename: "Unsupported file type." } };
  }

  const supabase = await createClient();

  try {
    const placement = await resolvePlacement(supabase, user, parsed.data);
    if ("error" in placement) {
      return { ok: false, message: placement.error, fieldErrors: placement.fieldErrors };
    }

    const { data: material, error } = await supabase
      .from("materials")
      .insert({
        user_id: user.id,
        title: parsed.data.title,
        source: accepted.source,
        original_filename: parsed.data.filename.slice(0, 255),
        mime_type: accepted.mime,
        file_size: parsed.data.size,
        subject_id: placement.subjectId,
        folder_id: placement.folderId,
        status: "uploading",
      })
      .select("id")
      .single();

    if (error || !material) {
      console.error("materials: insert failed", error?.message);
      return { ok: false, message: GENERIC_ERROR };
    }

    const path = materialObjectPath(user.id, material.id, parsed.data.filename);
    const target = await createUploadTarget(supabase, path);

    const { error: pathError } = await supabase
      .from("materials")
      .update({ storage_path: path })
      .eq("id", material.id);
    if (pathError) {
      console.error("materials: storage path update failed", pathError.message);
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(routes.materials);
    return { ok: true, materialId: material.id, uploadUrl: target.signedUrl, uploadToken: target.token };
  } catch (error) {
    console.error("materials: createFileMaterialAction failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

/**
 * Creates a material from typed or pasted notes. The text is stored as a
 * private text file so it goes through the same processing pipeline.
 */
export async function createTextMaterialAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const values = {
    title: formString(formData, "title"),
    text: formString(formData, "text"),
    subjectId: formString(formData, "subjectId"),
    folderId: formString(formData, "folderId"),
    newSubjectName: formString(formData, "newSubjectName"),
  };

  const limit = await rateLimit(`upload:${user.id}`, 60, 60 * 60_000);
  if (!limit.ok) {
    return errorState("You have added a lot recently. Please wait a little before adding more.", { values });
  }

  const parsed = createTextMaterialSchema.safeParse(values);
  if (!parsed.success) {
    return errorState("Please check the highlighted fields.", { fieldErrors: fieldErrorsFrom(parsed.error), values });
  }

  const supabase = await createClient();

  try {
    const placement = await resolvePlacement(supabase, user, parsed.data);
    if ("error" in placement) {
      return errorState(placement.error, { fieldErrors: placement.fieldErrors, values });
    }

    const bytes = new TextEncoder().encode(parsed.data.text);
    const { data: material, error } = await supabase
      .from("materials")
      .insert({
        user_id: user.id,
        title: parsed.data.title,
        source: "text",
        original_filename: "notes.txt",
        mime_type: "text/plain",
        file_size: bytes.byteLength,
        subject_id: placement.subjectId,
        folder_id: placement.folderId,
        status: "uploading",
      })
      .select("id")
      .single();

    if (error || !material) {
      console.error("materials: text insert failed", error?.message);
      return errorState(GENERIC_ERROR, { values });
    }

    const path = materialObjectPath(user.id, material.id, "notes.txt");
    await uploadMaterialBytes(supabase, path, bytes, "text/plain; charset=utf-8");
    const { error: pathError } = await supabase
      .from("materials")
      .update({ storage_path: path })
      .eq("id", material.id);
    if (pathError) {
      console.error("materials: text storage path update failed", pathError.message);
      return errorState(GENERIC_ERROR, { values });
    }

    revalidatePath(routes.materials);
    return { status: "success", message: "Notes saved. Processing…", values: { materialId: material.id } };
  } catch (error) {
    console.error("materials: createTextMaterialAction failed", error);
    return errorState(GENERIC_ERROR, { values });
  }
}

type Placement = { subjectId: string | null; folderId: string | null };
type PlacementInput = { subjectId: string | null; folderId: string | null; newSubjectName: string | null };

/**
 * Turns the picker values into ids, creating a new subject when asked. The
 * database's composite foreign keys reject folders that belong to another
 * subject or another user, which surfaces here as a friendly message.
 */
async function resolvePlacement(
  supabase: Client,
  user: CurrentUser,
  input: PlacementInput,
): Promise<Placement | { error: string; fieldErrors?: Record<string, string> }> {
  if (input.newSubjectName) {
    const name = input.newSubjectName;
    const { data: existing } = await supabase
      .from("subjects")
      .select("id")
      .ilike("name", name)
      .is("archived_at", null)
      .maybeSingle();
    if (existing) {
      return { subjectId: existing.id, folderId: null };
    }

    const { data: created, error } = await supabase
      .from("subjects")
      .insert({ user_id: user.id, name })
      .select("id")
      .single();
    if (error || !created) {
      console.error("subjects: create failed", error?.message);
      return { error: "Could not create that subject.", fieldErrors: { newSubjectName: "Could not create that subject." } };
    }
    return { subjectId: created.id, folderId: null };
  }

  if (input.folderId && !input.subjectId) {
    return { error: "Choose a subject for that folder.", fieldErrors: { folderId: "Choose a subject first." } };
  }

  if (input.subjectId) {
    const { data: subject } = await supabase
      .from("subjects")
      .select("id")
      .eq("id", input.subjectId)
      .maybeSingle();
    if (!subject) {
      return { error: "That subject no longer exists.", fieldErrors: { subjectId: "Choose another subject." } };
    }
  }

  if (input.folderId) {
    const { data: folder } = await supabase
      .from("folders")
      .select("id")
      .eq("id", input.folderId)
      .eq("subject_id", input.subjectId ?? "")
      .maybeSingle();
    if (!folder) {
      return { error: "That folder does not belong to the chosen subject.", fieldErrors: { folderId: "Choose another folder." } };
    }
  }

  return { subjectId: input.subjectId, folderId: input.folderId };
}

/** Records that the student opened a material (feeds "Recent materials"). */
export async function markMaterialOpenedAction(materialId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const parsed = materialIdSchema.safeParse({ materialId });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from("materials")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("id", parsed.data.materialId);
}

/**
 * Removes a material whose upload never finished — the student canceled it
 * or the transfer failed — so no card is left saying "Uploading" forever.
 * Only rows still in "uploading" go, with any partial object.
 */
export async function discardUploadAction(materialId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const parsed = materialIdSchema.safeParse({ materialId });
  if (!parsed.success) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .delete()
    .eq("id", parsed.data.materialId)
    .eq("status", "uploading")
    .select("id, user_id, storage_path");
  if (error) {
    console.error("materials: discarding an unfinished upload failed", error.message);
    return;
  }
  const key = data?.[0] ? ownedObjectKey(data[0]) : null;
  if (key) await removeMaterialObjects(supabase, [key]).catch(() => undefined);
  revalidatePath(routes.materials);
}
