"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { z } from "zod";

import {
  aiInput,
  appearanceInput,
  assistantInput,
  dashboardInput,
  notificationsInput,
  privacyInput,
  studyInput,
  toolsInput,
  type PreferenceSection,
} from "@/lib/preferences/schema";
import { getPreferences } from "@/lib/preferences/queries";
import { describeRetry, rateLimit } from "@/lib/rate-limit";
import { routes } from "@/lib/routes";
import type { Json } from "@/lib/supabase/database.types";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { APPEARANCE_COOKIE, APPEARANCE_COOKIE_MAX_AGE, encodeAppearance } from "@/lib/theme/appearance";

/**
 * Saving preferences (UI phase §8–§11, §34). One action per section; each
 * validates strictly, writes only its own section through the atomic
 * `set_preference_section` function (row-level security applies) and
 * refreshes the pages that read it.
 */

export type SavePreferencesResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const MINUTE = 60_000;

function invalid(error: z.ZodError): SavePreferencesResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }
  const first = Object.values(fieldErrors)[0];
  return { ok: false, error: first ?? "Please check your choices.", fieldErrors };
}

async function writeSection(section: PreferenceSection, value: unknown): Promise<SavePreferencesResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session has ended. Please sign in again." };

  const limit = await rateLimit(`preferences:${user.id}`, 60, MINUTE);
  if (!limit.ok) {
    return { ok: false, error: `That was a lot of changes at once. Try again in ${describeRetry(limit.retryAfterSeconds)}.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_preference_section", { section_name: section, section_value: value as Json });
  if (error) {
    console.error(`preferences: failed to save ${section}`, error.message);
    return { ok: false, error: "We could not save that change. Please try again." };
  }
  return { ok: true };
}

/** Theme color and reduced motion. Also mirrors them into the appearance cookie for the first paint. */
export async function saveAppearanceAction(input: unknown): Promise<SavePreferencesResult> {
  const parsed = appearanceInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await writeSection("appearance", parsed.data);
  if (!result.ok) return result;

  (await cookies()).set(APPEARANCE_COOKIE, encodeAppearance(parsed.data), {
    path: "/",
    sameSite: "lax",
    maxAge: APPEARANCE_COOKIE_MAX_AGE,
    secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"),
  });
  revalidatePath("/", "layout");
  return result;
}

/** Which dashboard widgets show, and in what order. */
export async function saveDashboardAction(input: unknown): Promise<SavePreferencesResult> {
  const parsed = dashboardInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await writeSection("dashboard", parsed.data);
  if (result.ok) {
    revalidatePath(routes.dashboard);
    revalidatePath(routes.settingsDashboard);
  }
  return result;
}

/** Which tools are pinned to the navigation (the rest stay in More tools). */
export async function saveToolsAction(input: unknown): Promise<SavePreferencesResult> {
  const parsed = toolsInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await writeSection("tools", parsed.data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Response language, style and explanation depth for every AI answer. */
export async function saveAiPreferencesAction(input: unknown): Promise<SavePreferencesResult> {
  const parsed = aiInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await writeSection("ai", parsed.data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/**
 * Just the response language (Settings → Tamari, and the chat's first
 * question "Anong language gusto mong gamitin natin?"): the style and depth
 * already saved stay as they are.
 */
export async function saveResponseLanguageAction(input: { language: unknown; otherLanguage: unknown }): Promise<SavePreferencesResult> {
  const current = (await getPreferences()).ai;
  const parsed = aiInput.safeParse({ ...current, language: input.language, otherLanguage: input.language === "other" ? input.otherLanguage : "", languageChosen: true });
  if (!parsed.success) return invalid(parsed.error);
  const result = await writeSection("ai", parsed.data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Just how Tamari explains (Settings → How Tamari explains): the response language already saved stays as it is. */
export async function saveAnswerStyleAction(input: { style: unknown; depth: unknown }): Promise<SavePreferencesResult> {
  const current = (await getPreferences()).ai;
  const parsed = aiInput.safeParse({ ...current, style: input.style, depth: input.depth });
  if (!parsed.success) return invalid(parsed.error);
  const result = await writeSection("ai", parsed.data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Preferred study methods (shown first in the session builder). */
export async function saveStudyPreferencesAction(input: unknown): Promise<SavePreferencesResult> {
  const parsed = studyInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await writeSection("study", parsed.data);
  if (result.ok) {
    revalidatePath(routes.study);
    revalidatePath(routes.settingsPreferences);
  }
  return result;
}

/** Notification channels, the default reminder and muted kinds. */
export async function saveNotificationPreferencesAction(input: unknown): Promise<SavePreferencesResult> {
  const parsed = notificationsInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await writeSection("notifications", parsed.data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Privacy: whether anonymous usage events may be shared (off by default). */
export async function savePrivacyPreferencesAction(input: unknown): Promise<SavePreferencesResult> {
  const parsed = privacyInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await writeSection("privacy", parsed.data);
  if (result.ok) revalidatePath(routes.settingsAccount);
  return result;
}

/** Tamari: the corner button, idle animations, contextual hints, voice and spoken replies. */
export async function saveAssistantPreferencesAction(input: unknown): Promise<SavePreferencesResult> {
  const parsed = assistantInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await writeSection("assistant", parsed.data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
