import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAiError } from "@/lib/ai";
import { ServiceError } from "@/lib/reviewers/service";
import { routes } from "@/lib/routes";
import { SessionError } from "@/lib/study/sessions";

/** Helpers shared by the study Server Action modules. */

export type StudyActionResult<T = undefined> = ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T })) | { ok: false; message: string };

export const uuid = z.uuid();

export function revalidateStudy(sessionId?: string) {
  revalidatePath(routes.study);
  revalidatePath(routes.dashboard);
  revalidatePath(`${routes.quiz}/mistakes`);
  if (sessionId) revalidatePath(`${routes.study}/${sessionId}`);
}

/** Turns expected errors into their message and logs the rest behind a generic one (§44). */
export function actionFailure(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof SessionError || error instanceof ServiceError) return { ok: false, message: error.message };
  if (isAiError(error)) return { ok: false, message: error.message };
  console.error(fallback, error);
  return { ok: false, message: fallback };
}
