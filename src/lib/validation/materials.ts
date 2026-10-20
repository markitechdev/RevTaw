import { z } from "zod";

import {
  acceptedTypeFor,
  MATERIAL_TITLE_MAX,
  MAX_FILE_BYTES,
  MAX_TEXT_CHARS,
  MIN_TEXT_CHARS,
} from "@/lib/materials/constants";

const uuid = z.uuid({ message: "Invalid id." });

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null))
  .pipe(uuid.nullable());

export const titleSchema = z
  .string({ message: "Give this material a title." })
  .trim()
  .min(1, "Give this material a title.")
  .max(MATERIAL_TITLE_MAX, `Use at most ${MATERIAL_TITLE_MAX} characters.`);

export const nameSchema = z
  .string({ message: "Enter a name." })
  .trim()
  .min(1, "Enter a name.")
  .max(80, "Use at most 80 characters.")
  .refine((value) => !/[<>]/.test(value), "Names cannot contain < or > characters.");

/** Where a new material goes: an existing subject/folder or a new subject. */
export const placementSchema = z.object({
  subjectId: optionalUuid,
  folderId: optionalUuid,
  newSubjectName: z
    .string()
    .trim()
    .max(80, "Use at most 80 characters.")
    .optional()
    .transform((value) => value || null),
});

export const createFileMaterialSchema = placementSchema
  .extend({
    title: titleSchema,
    filename: z.string().trim().min(1, "Choose a file.").max(255, "That file name is too long."),
    mimeType: z.string().trim().max(120).default(""),
    size: z
      .number({ message: "Choose a file." })
      .int()
      .positive("That file is empty.")
      .max(MAX_FILE_BYTES, "Files must be 25 MB or smaller."),
  })
  .superRefine((value, ctx) => {
    if (!acceptedTypeFor(value.filename, value.mimeType)) {
      ctx.addIssue({
        code: "custom",
        path: ["filename"],
        message: "Use a PDF, Word document (DOC/DOCX), image (PNG, JPG, WebP, GIF) or text file.",
      });
    }
  });

export const createTextMaterialSchema = placementSchema.extend({
  title: titleSchema,
  text: z
    .string({ message: "Paste or type your notes." })
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(MIN_TEXT_CHARS, `Add at least ${MIN_TEXT_CHARS} characters so there is something to study.`)
        .max(MAX_TEXT_CHARS, `Notes are limited to ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters.`),
    ),
});

export const subjectInputSchema = z.object({
  name: nameSchema,
});

export const folderInputSchema = z.object({
  subjectId: uuid,
  name: nameSchema,
});

export const renameMaterialSchema = z.object({
  materialId: uuid,
  title: titleSchema,
});

export const moveMaterialSchema = z.object({
  materialId: uuid,
  subjectId: optionalUuid,
  folderId: optionalUuid,
});

export const materialIdSchema = z.object({
  materialId: uuid,
});

export type CreateFileMaterialInput = z.input<typeof createFileMaterialSchema>;
export type CreateTextMaterialInput = z.input<typeof createTextMaterialSchema>;
