import { z } from "zod";

import { BUILDER_METHOD_IDS, type BuilderMethodId } from "@/lib/study/catalog";
import type { NotificationKind } from "@/lib/supabase/database.types";

/**
 * Personal preferences (UI phase §8–§11, §23, §29, §34–§35), stored per
 * student in `profiles.preferences` one section at a time.
 *
 * Every section has two schemas:
 *  - an *input* schema, strict, used by the Server Actions that save it, so a
 *    bad payload is rejected rather than stored;
 *  - a lenient *reader* (`parsePreferences`) that never throws: anything
 *    missing or malformed falls back to its default, so an old or hand-edited
 *    value can never break a page.
 *
 * Client-safe: settings forms import the option lists from here.
 */

/* ------------------------------------------------------------------ */
/* Appearance                                                          */
/* ------------------------------------------------------------------ */

export const ACCENT_IDS = ["purple", "blue", "green", "orange", "pink", "red", "teal", "custom"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];
export type PresetAccentId = Exclude<AccentId, "custom">;

/** The presets in globals.css (`[data-accent=…]`), in the order they are offered. */
export const ACCENT_PRESETS: ReadonlyArray<{ id: PresetAccentId; label: string }> = [
  { id: "purple", label: "RevTaw Purple" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "orange", label: "Orange" },
  { id: "pink", label: "Pink" },
  { id: "red", label: "Red" },
  { id: "teal", label: "Teal" },
];

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
export type AppearancePreferences = z.output<typeof appearanceInput>;
export const DEFAULT_APPEARANCE: AppearancePreferences = { accent: "purple", customColor: null, reduceMotion: false };

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

/**
 * Home dashboard widgets (§5, §6, §8). "focus" widgets form the primary area
 * (the first one is shown large); "glance" widgets are the compact secondary
 * row. Wide glance widgets are lists and take two columns.
 */
export const DASHBOARD_WIDGETS = [
  { id: "continue", label: "Continue studying", description: "The session, quiz or material you left off with.", zone: "focus", wide: false },
  { id: "recommendation", label: "RevTaw recommendation", description: "One next step, and why RevTaw picked it.", zone: "focus", wide: false },
  { id: "due", label: "Due today", description: "Flashcards, scheduled reviews, planned sessions and tasks for today.", zone: "focus", wide: false },
  { id: "exam", label: "Upcoming exam", description: "Countdown and readiness for your next exam.", zone: "glance", wide: false },
  { id: "streak", label: "Study streak", description: "Days in a row, your level and XP.", zone: "glance", wide: false },
  { id: "time", label: "Study time", description: "Today's focus minutes and the last seven days.", zone: "glance", wide: false },
  { id: "mastery", label: "Mastery", description: "How many concepts are mastered, strong, learning or weak.", zone: "glance", wide: false },
  { id: "recent", label: "Recent materials", description: "The files you opened last.", zone: "glance", wide: true },
  { id: "weak", label: "Weak topics", description: "Concepts that need another pass.", zone: "glance", wide: true },
  { id: "flashcards", label: "Flashcards", description: "Your decks and what is due in each.", zone: "glance", wide: true },
  { id: "goals", label: "Goals", description: "Daily and weekly goals with progress.", zone: "glance", wide: true },
  { id: "planner", label: "Planner", description: "Planned sessions and tasks for the next seven days.", zone: "glance", wide: true },
] as const;

export type WidgetId = (typeof DASHBOARD_WIDGETS)[number]["id"];
export type WidgetZone = (typeof DASHBOARD_WIDGETS)[number]["zone"];
export const WIDGET_IDS = DASHBOARD_WIDGETS.map((widget) => widget.id) as [WidgetId, ...WidgetId[]];
export const WIDGET_BY_ID = Object.fromEntries(DASHBOARD_WIDGETS.map((widget) => [widget.id, widget])) as {
  [K in WidgetId]: Extract<(typeof DASHBOARD_WIDGETS)[number], { id: K }>;
};

/** Off by default: the dashboard starts calm, with only what needs action today (§5). */
export const DEFAULT_HIDDEN_WIDGETS: ReadonlyArray<WidgetId> = ["weak", "flashcards", "goals", "planner"];

export type DashboardPreferences = { order: WidgetId[]; hidden: WidgetId[] };
export const DEFAULT_DASHBOARD: DashboardPreferences = { order: [...WIDGET_IDS], hidden: [...DEFAULT_HIDDEN_WIDGETS] };

function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === "string" && (WIDGET_IDS as readonly string[]).includes(value);
}

/**
 * Cleans a stored layout: unknown ids are dropped, duplicates removed, and
 * widgets the layout has never seen (added in a later version) join at the
 * end with their default visibility.
 */
export function normalizeDashboard(value: { order?: readonly unknown[]; hidden?: readonly unknown[] }): DashboardPreferences {
  const order = [...new Set((value.order ?? []).filter(isWidgetId))];
  if (order.length === 0) return { order: [...DEFAULT_DASHBOARD.order], hidden: [...DEFAULT_DASHBOARD.hidden] };
  const unseen = WIDGET_IDS.filter((id) => !order.includes(id));
  const hidden = new Set((value.hidden ?? []).filter(isWidgetId));
  for (const id of unseen) if (DEFAULT_HIDDEN_WIDGETS.includes(id)) hidden.add(id);
  return { order: [...order, ...unseen], hidden: WIDGET_IDS.filter((id) => hidden.has(id)) };
}

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

/**
 * Tools a student can pin to the navigation or leave in More Tools (§9, §12).
 * Home and Settings are always there and are not listed. The labels, icons
 * and links live in src/components/app/nav-items.ts.
 */
export const TOOL_IDS = [
  "study",
  "materials",
  "planner",
  "quiz",
  "flashcards",
  "reviewer",
  "notes",
  "methods",
  "progress",
  "tutor",
  "mistakes",
  "memory",
  "map",
  "achievements",
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

/** Pinned until the student changes it: the spec's Main, Create and Learn groups. */
export const DEFAULT_PINNED_TOOLS: ReadonlyArray<ToolId> = ["study", "materials", "planner", "quiz", "flashcards", "reviewer", "notes", "methods", "progress"];

export type ToolPreferences = { pinned: ToolId[] };
export const DEFAULT_TOOLS: ToolPreferences = { pinned: [...DEFAULT_PINNED_TOOLS] };

function isToolId(value: unknown): value is ToolId {
  return typeof value === "string" && (TOOL_IDS as readonly string[]).includes(value);
}

/** Pinned tools in catalog order, without duplicates or unknown ids. */
export function normalizeTools(value: { pinned?: readonly unknown[] }): ToolPreferences {
  const pinned = new Set((value.pinned ?? []).filter(isToolId));
  return { pinned: TOOL_IDS.filter((id) => pinned.has(id)) };
}

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

export const RESPONSE_LANGUAGES = [
  { id: "auto", label: "Auto", hint: "Answer in the language I write in" },
  { id: "en", label: "English", hint: "Always English" },
  { id: "fil", label: "Filipino", hint: "Palaging Filipino" },
  { id: "taglish", label: "Taglish", hint: "Halo ng Tagalog at English" },
  { id: "other", label: "Other", hint: "Name the language" },
] as const;
export type ResponseLanguage = (typeof RESPONSE_LANGUAGES)[number]["id"];
const RESPONSE_LANGUAGE_IDS = RESPONSE_LANGUAGES.map((item) => item.id) as [ResponseLanguage, ...ResponseLanguage[]];

export const RESPONSE_STYLES = [
  { id: "friendly", label: "Friendly", hint: "Warm and encouraging, like a study buddy" },
  { id: "concise", label: "Concise", hint: "Short and straight to the point" },
  { id: "formal", label: "Formal", hint: "Precise and academic" },
] as const;
export type ResponseStyle = (typeof RESPONSE_STYLES)[number]["id"];
const RESPONSE_STYLE_IDS = RESPONSE_STYLES.map((item) => item.id) as [ResponseStyle, ...ResponseStyle[]];

export const EXPLANATION_DEPTHS = [
  { id: "simple", label: "Simple", hint: "Plain words, one idea at a time" },
  { id: "standard", label: "Standard", hint: "Balanced detail" },
  { id: "deep", label: "In depth", hint: "Full reasoning, edge cases and connections" },
] as const;
export type ExplanationDepth = (typeof EXPLANATION_DEPTHS)[number]["id"];
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
export type AiPreferences = z.output<typeof aiInput>;
export const DEFAULT_AI: AiPreferences = { language: "auto", otherLanguage: "", style: "friendly", depth: "standard", languageChosen: false };

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

export const MAX_PREFERRED_METHODS = 8;

export const studyInput = z.strictObject({
  preferredMethods: z
    .array(z.enum(BUILDER_METHOD_IDS))
    .max(MAX_PREFERRED_METHODS, `Pick up to ${MAX_PREFERRED_METHODS} methods.`)
    .transform((ids) => [...new Set(ids)]),
});
export type StudyPreferences = { preferredMethods: BuilderMethodId[] };
export const DEFAULT_STUDY: StudyPreferences = { preferredMethods: [] };

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

/** Reminder presets for planner activities (§29); "custom" minutes are set per activity. */
export const REMINDER_OFFSETS = [
  { id: "none", label: "No reminder", minutes: null },
  { id: "at_time", label: "At the time", minutes: 0 },
  { id: "10m", label: "10 minutes before", minutes: 10 },
  { id: "30m", label: "30 minutes before", minutes: 30 },
  { id: "1h", label: "1 hour before", minutes: 60 },
  { id: "1d", label: "1 day before", minutes: 1440 },
] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number]["id"];
const REMINDER_OFFSET_IDS = REMINDER_OFFSETS.map((item) => item.id) as [ReminderOffset, ...ReminderOffset[]];

/** In-app notification kinds a student can mute (the rest stay on). */
export const MUTABLE_NOTIFICATION_KINDS: ReadonlyArray<{ id: NotificationKind; label: string; hint: string }> = [
  { id: "review_due", label: "Reviews due", hint: "Flashcards and concepts that are due" },
  { id: "exam_upcoming", label: "Upcoming exams", hint: "A heads-up as an exam gets close" },
  { id: "plan_reminder", label: "Planned sessions", hint: "Today's planned study blocks" },
  { id: "daily_goal", label: "Goals", hint: "Goal progress and completions" },
  { id: "streak", label: "Streaks", hint: "Keeping or losing a streak" },
  { id: "achievement", label: "Badges and levels", hint: "New badges and level-ups" },
  { id: "reminder", label: "Planner reminders", hint: "The reminders you set on calendar activities" },
];
const MUTABLE_KIND_IDS = MUTABLE_NOTIFICATION_KINDS.map((item) => item.id) as [NotificationKind, ...NotificationKind[]];

export const notificationsInput = z.strictObject({
  inApp: z.boolean(),
  email: z.boolean(),
  browser: z.boolean(),
  defaultReminder: z.enum(REMINDER_OFFSET_IDS),
  muted: z
    .array(z.enum(MUTABLE_KIND_IDS))
    .max(MUTABLE_KIND_IDS.length * 2)
    .transform((ids) => [...new Set(ids)]),
});
export type NotificationPreferences = z.output<typeof notificationsInput>;
export const DEFAULT_NOTIFICATIONS: NotificationPreferences = { inApp: true, email: false, browser: false, defaultReminder: "30m", muted: [] };

const notificationsReader = z
  .object({
    inApp: z.boolean().catch(true),
    email: z.boolean().catch(false),
    browser: z.boolean().catch(false),
    defaultReminder: z.enum(REMINDER_OFFSET_IDS).catch(DEFAULT_NOTIFICATIONS.defaultReminder),
    muted: z
      .array(z.unknown())
      .transform((ids) => [...new Set(ids.filter((id): id is NotificationKind => typeof id === "string" && (MUTABLE_KIND_IDS as readonly string[]).includes(id)))])
      .catch(() => []),
  })
  .catch(() => ({ ...DEFAULT_NOTIFICATIONS, muted: [] }));

/* ------------------------------------------------------------------ */
/* Tamari (the assistant and its corner button)                        */
/* ------------------------------------------------------------------ */

export const assistantInput = z.strictObject({
  /** Show the corner button on every page. */
  launcher: z.boolean(),
  /** Tamari in the corner button and the chat; off shows a plain chat button. */
  mascot: z.boolean(),
  /** Tamari's small idle movements (a 1–2 px bob, breathing while napping). */
  idleAnimations: z.boolean(),
  /** Short contextual hints in a speech bubble now and then. */
  suggestions: z.boolean(),
  /** The microphone in the chat: voice questions and commands. */
  voice: z.boolean(),
  /** Read answers aloud in voice mode. */
  voiceReplies: z.boolean(),
});
export type AssistantPreferences = z.output<typeof assistantInput>;
export const DEFAULT_ASSISTANT: AssistantPreferences = { launcher: true, mascot: true, idleAnimations: true, suggestions: true, voice: true, voiceReplies: true };

// Saved before Tamari had settings? Every switch it did not have yet starts on.
const assistantReader = z
  .object({
    launcher: z.boolean().catch(true),
    mascot: z.boolean().catch(true),
    idleAnimations: z.boolean().catch(true),
    suggestions: z.boolean().catch(true),
    voice: z.boolean().catch(true),
    voiceReplies: z.boolean().catch(true),
  })
  .catch(DEFAULT_ASSISTANT);

/* ------------------------------------------------------------------ */
/* All sections                                                        */
/* ------------------------------------------------------------------ */

export type Preferences = {
  appearance: AppearancePreferences;
  dashboard: DashboardPreferences;
  tools: ToolPreferences;
  ai: AiPreferences;
  study: StudyPreferences;
  notifications: NotificationPreferences;
  assistant: AssistantPreferences;
};
export type PreferenceSection = keyof Preferences;

export const DEFAULT_PREFERENCES: Preferences = {
  appearance: DEFAULT_APPEARANCE,
  dashboard: DEFAULT_DASHBOARD,
  tools: DEFAULT_TOOLS,
  ai: DEFAULT_AI,
  study: DEFAULT_STUDY,
  notifications: DEFAULT_NOTIFICATIONS,
  assistant: DEFAULT_ASSISTANT,
};

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
  };
}
