import { z } from "zod";

import {
  ACCENT_IDS,
  DEFAULT_AI,
  DEFAULT_APPEARANCE,
  DEFAULT_ASSISTANT,
  DEFAULT_DASHBOARD,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  DEFAULT_TOOLS,
  EXPLANATION_DEPTHS,
  MAX_PREFERRED_METHODS,
  MUTABLE_NOTIFICATION_KINDS,
  normalizeDashboard,
  normalizeTools,
  REMINDER_OFFSETS,
  RESPONSE_LANGUAGES,
  RESPONSE_STYLES,
  TOOL_IDS,
  WIDGET_IDS,
  type AiPreferences,
  type AppearancePreferences,
  type AssistantPreferences,
  type ExplanationDepth,
  type NotificationPreferences,
  type PreferenceSection,
  type Preferences,
  type PrivacyPreferences,
  type ReminderOffset,
  type ResponseLanguage,
  type ResponseStyle,
  type StudyPreferences,
} from "@/lib/preferences/options";
import { BUILDER_METHOD_IDS, type BuilderMethodId } from "@/lib/study/catalog";
import type { NotificationKind } from "@/lib/supabase/database.types";
import { assertSameType } from "@/lib/type-assert";

export * from "@/lib/preferences/options";

/**
 * Validation for personal preferences, stored per student in
 * `profiles.preferences` one section at a time. The option lists, defaults
 * and section types are in `options.ts` (zod-free, for the browser) and are
 * re-exported here.
 *
 * Every section has two schemas:
 *  - an *input* schema, strict, used by the Server Actions that save it, so a
 *    bad payload is rejected rather than stored;
 *  - a lenient *reader* (`parsePreferences`) that never throws: anything
 *    missing or malformed falls back to its default, so an old or hand-edited
 *    value can never break a page.
 */

/* ------------------------------------------------------------------ */
/* Appearance                                                          */
/* ------------------------------------------------------------------ */

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color such as #3b82f6.")
  .transform((value) => value.toLowerCase());

export const appearanceInput = z
  .strictObject({
    accent: z.enum(ACCENT_IDS),
    customColor: hexColor.nullable(),
    reduceMotion: z.boolean(),
  })
  .refine((value) => value.accent !== "custom" || value.customColor !== null, {
    message: "Pick a custom color first.",
    path: ["customColor"],
  });
assertSameType<z.output<typeof appearanceInput>, AppearancePreferences>();

const appearanceReader = z
  .object({
    accent: z.enum(ACCENT_IDS).catch(DEFAULT_APPEARANCE.accent),
    customColor: hexColor.nullable().catch(null),
    reduceMotion: z.boolean().catch(false),
  })
  .catch(DEFAULT_APPEARANCE);

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export const dashboardInput = z
  .strictObject({
    order: z.array(z.enum(WIDGET_IDS)).max(WIDGET_IDS.length * 2),
    hidden: z.array(z.enum(WIDGET_IDS)).max(WIDGET_IDS.length * 2),
  })
  .transform(normalizeDashboard);

const dashboardReader = z
  .object({ order: z.array(z.unknown()).catch(() => []), hidden: z.array(z.unknown()).catch(() => []) })
  .transform(normalizeDashboard)
  .catch(() => ({ order: [...DEFAULT_DASHBOARD.order], hidden: [...DEFAULT_DASHBOARD.hidden] }));

/* ------------------------------------------------------------------ */
/* RevTaw tools (navigation)                                           */
/* ------------------------------------------------------------------ */

export const toolsInput = z
  .strictObject({ pinned: z.array(z.enum(TOOL_IDS)).max(TOOL_IDS.length * 2) })
  .transform(normalizeTools);

const toolsReader = z
  .object({ pinned: z.array(z.unknown()) })
  .transform(normalizeTools)
  .catch(() => ({ pinned: [...DEFAULT_TOOLS.pinned] }));

/* ------------------------------------------------------------------ */
/* AI preferences                                                      */
/* ------------------------------------------------------------------ */

const RESPONSE_LANGUAGE_IDS = RESPONSE_LANGUAGES.map((item) => item.id) as [ResponseLanguage, ...ResponseLanguage[]];
const RESPONSE_STYLE_IDS = RESPONSE_STYLES.map((item) => item.id) as [ResponseStyle, ...ResponseStyle[]];
const EXPLANATION_DEPTH_IDS = EXPLANATION_DEPTHS.map((item) => item.id) as [ExplanationDepth, ...ExplanationDepth[]];

/** A language name typed by the student: letters, spaces and a few separators only (it goes into AI prompts). */
const languageName = z
  .string()
  .trim()
  .max(40, "Keep the language name under 40 characters.")
  .regex(/^[\p{L}\p{M} ()'-]*$/u, "Use letters only, for example Cebuano or Español.");

export const aiInput = z
  .strictObject({
    language: z.enum(RESPONSE_LANGUAGE_IDS),
    otherLanguage: languageName,
    style: z.enum(RESPONSE_STYLE_IDS),
    depth: z.enum(EXPLANATION_DEPTH_IDS),
    /** True once the student has answered "Which language should RevTaw use?" (§24). */
    languageChosen: z.boolean(),
  })
  .refine((value) => value.language !== "other" || value.otherLanguage.length > 0, {
    message: "Type the language RevTaw should use.",
    path: ["otherLanguage"],
  });
assertSameType<z.output<typeof aiInput>, AiPreferences>();

const aiReader = z
  .object({
    language: z.enum(RESPONSE_LANGUAGE_IDS).catch(DEFAULT_AI.language),
    otherLanguage: languageName.catch(""),
    style: z.enum(RESPONSE_STYLE_IDS).catch(DEFAULT_AI.style),
    depth: z.enum(EXPLANATION_DEPTH_IDS).catch(DEFAULT_AI.depth),
    languageChosen: z.boolean().catch(false),
  })
  .transform((value) => (value.language === "other" && !value.otherLanguage ? { ...value, language: "auto" as const } : value))
  .catch(DEFAULT_AI);

/* ------------------------------------------------------------------ */
/* Study                                                               */
/* ------------------------------------------------------------------ */

export const studyInput = z.strictObject({
  preferredMethods: z
    .array(z.enum(BUILDER_METHOD_IDS))
    .max(MAX_PREFERRED_METHODS, `Pick up to ${MAX_PREFERRED_METHODS} methods.`)
    .transform((ids) => [...new Set(ids)]),
});
assertSameType<z.output<typeof studyInput>, StudyPreferences>();

const studyReader = z
  .object({
    preferredMethods: z
      .array(z.unknown())
      .transform((ids) => [...new Set(ids.filter((id): id is BuilderMethodId => typeof id === "string" && (BUILDER_METHOD_IDS as readonly string[]).includes(id)))].slice(0, MAX_PREFERRED_METHODS))
      .catch(() => []),
  })
  .catch(() => ({ preferredMethods: [] }));

/* ------------------------------------------------------------------ */
/* Notifications and reminders                                         */
/* ------------------------------------------------------------------ */

const REMINDER_OFFSET_IDS = REMINDER_OFFSETS.map((item) => item.id) as [ReminderOffset, ...ReminderOffset[]];
const MUTABLE_KIND_IDS = MUTABLE_NOTIFICATION_KINDS.map((item) => item.id) as [NotificationKind, ...NotificationKind[]];

export const notificationsInput = z.strictObject({
  inApp: z.boolean(),
  email: z.boolean(),
  /** One email each morning: today's reviews, plan and exam countdown (needs email). */
  digest: z.boolean(),
  browser: z.boolean(),
  defaultReminder: z.enum(REMINDER_OFFSET_IDS),
  muted: z
    .array(z.enum(MUTABLE_KIND_IDS))
    .max(MUTABLE_KIND_IDS.length * 2)
    .transform((ids) => [...new Set(ids)]),
});
assertSameType<z.output<typeof notificationsInput>, NotificationPreferences>();

const notificationsReader = z
  .object({
    inApp: z.boolean().catch(true),
    email: z.boolean().catch(false),
    digest: z.boolean().catch(false),
    browser: z.boolean().catch(false),
    defaultReminder: z.enum(REMINDER_OFFSET_IDS).catch(DEFAULT_NOTIFICATIONS.defaultReminder),
    muted: z
      .array(z.unknown())
      .transform((ids) => [...new Set(ids.filter((id): id is NotificationKind => typeof id === "string" && (MUTABLE_KIND_IDS as readonly string[]).includes(id)))])
      .catch(() => []),
  })
  .catch(() => ({ ...DEFAULT_NOTIFICATIONS, muted: [] }));

/* ------------------------------------------------------------------ */
/* Tamari (companion doc §19: never mandatory)                         */
/* ------------------------------------------------------------------ */

/** Every switch is described on `AssistantPreferences` in options.ts. */
export const assistantInput = z.strictObject({
  launcher: z.boolean(),
  mascot: z.boolean(),
  idleAnimations: z.boolean(),
  suggestions: z.boolean(),
  voice: z.boolean(),
  reactions: z.boolean(),
  voiceReplies: z.boolean(),
});
assertSameType<z.output<typeof assistantInput>, AssistantPreferences>();

// Saved before Tamari had settings? Every switch it did not have yet starts on.
const assistantReader = z
  .object({
    launcher: z.boolean().catch(true),
    mascot: z.boolean().catch(true),
    idleAnimations: z.boolean().catch(true),
    suggestions: z.boolean().catch(true),
    voice: z.boolean().catch(true),
    reactions: z.boolean().catch(true),
    voiceReplies: z.boolean().catch(true),
  })
  .catch(DEFAULT_ASSISTANT);

/* ------------------------------------------------------------------ */
/* Privacy                                                             */
/* ------------------------------------------------------------------ */

export const privacyInput = z.strictObject({
  /** Share anonymous usage events (what features are used, never content). Off unless the student turns it on. */
  analytics: z.boolean(),
});
assertSameType<z.output<typeof privacyInput>, PrivacyPreferences>();

const privacyReader = z.object({ analytics: z.boolean().catch(false) }).catch(DEFAULT_PRIVACY);

/* ------------------------------------------------------------------ */
/* All sections                                                        */
/* ------------------------------------------------------------------ */

function section(raw: unknown, key: PreferenceSection): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return (raw as Record<string, unknown>)[key];
}

/** Reads `profiles.preferences`. Never throws: defaults fill anything missing or invalid. */
export function parsePreferences(raw: unknown): Preferences {
  const appearance = appearanceReader.parse(section(raw, "appearance") ?? {});
  return {
    // A custom accent without a color cannot be shown; fall back to the default.
    appearance: appearance.accent === "custom" && !appearance.customColor ? { ...appearance, accent: "purple" } : appearance,
    dashboard: dashboardReader.parse(section(raw, "dashboard") ?? {}),
    tools: toolsReader.parse(section(raw, "tools") ?? {}),
    ai: aiReader.parse(section(raw, "ai") ?? {}),
    study: studyReader.parse(section(raw, "study") ?? {}),
    notifications: notificationsReader.parse(section(raw, "notifications") ?? {}),
    assistant: assistantReader.parse(section(raw, "assistant") ?? {}),
    privacy: privacyReader.parse(section(raw, "privacy") ?? {}),
  };
}
