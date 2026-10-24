import type { BuilderMethodId } from "@/lib/study/catalog";
import type { NotificationKind } from "@/lib/supabase/database.types";

/**
 * The preference vocabulary (UI phase §8–§11, §23, §29, §34–§35): option
 * lists, defaults and the shape of every section. Client-safe and free of
 * zod, so the navigation, the dashboard and the settings forms can use it
 * without the browser downloading the validators; those (input schemas and
 * the lenient reader) are in `schema.ts`, which re-exports everything here.
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

export type AppearancePreferences = { accent: AccentId; customColor: string | null; reduceMotion: boolean };
export const DEFAULT_APPEARANCE: AppearancePreferences = { accent: "purple", customColor: null, reduceMotion: false };

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

export const RESPONSE_STYLES = [
  { id: "friendly", label: "Friendly", hint: "Warm and encouraging, like a study buddy" },
  { id: "concise", label: "Concise", hint: "Short and straight to the point" },
  { id: "formal", label: "Formal", hint: "Precise and academic" },
] as const;
export type ResponseStyle = (typeof RESPONSE_STYLES)[number]["id"];

export const EXPLANATION_DEPTHS = [
  { id: "simple", label: "Simple", hint: "Plain words, one idea at a time" },
  { id: "standard", label: "Standard", hint: "Balanced detail" },
  { id: "deep", label: "In depth", hint: "Full reasoning, edge cases and connections" },
] as const;
export type ExplanationDepth = (typeof EXPLANATION_DEPTHS)[number]["id"];

export type AiPreferences = {
  language: ResponseLanguage;
  otherLanguage: string;
  style: ResponseStyle;
  depth: ExplanationDepth;
  /** True once the student has answered "Which language should RevTaw use?" (§24). */
  languageChosen: boolean;
};
export const DEFAULT_AI: AiPreferences = { language: "auto", otherLanguage: "", style: "friendly", depth: "standard", languageChosen: false };

/* ------------------------------------------------------------------ */
/* Study                                                               */
/* ------------------------------------------------------------------ */

export const MAX_PREFERRED_METHODS = 8;

export type StudyPreferences = { preferredMethods: BuilderMethodId[] };
export const DEFAULT_STUDY: StudyPreferences = { preferredMethods: [] };

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

export type NotificationPreferences = {
  inApp: boolean;
  email: boolean;
  /** One email each morning: today's reviews, plan and exam countdown (needs email). */
  digest: boolean;
  browser: boolean;
  defaultReminder: ReminderOffset;
  muted: NotificationKind[];
};
export const DEFAULT_NOTIFICATIONS: NotificationPreferences = { inApp: true, email: false, digest: false, browser: false, defaultReminder: "30m", muted: [] };

/* ------------------------------------------------------------------ */
/* Tamari (companion doc §19: never mandatory)                         */
/* ------------------------------------------------------------------ */

export type AssistantPreferences = {
  /** The round chat button in the corner of every page but Home (and of Home too with Tamari hidden); off: the chat opens from Ctrl/Cmd+K and "Ask Tamari why". */
  launcher: boolean;
  /** Show Tamari: in the Continue studying card on Home (Tamari's picture is on Home only). */
  mascot: boolean;
  /** Pixel animations: Tamari's small stepped movements on Home (breathing, blinking, typing, a hop). */
  idleAnimations: boolean;
  /** Study suggestions: Tamari's lines on Home from the student's data, and the offer to plan their time. */
  suggestions: boolean;
  /** Voice commands: the microphone in the chat. */
  voice: boolean;
  /** Contextual reactions: Tamari's face on Home follows what is going on (a repeated mistake, an exam, a nap). */
  reactions: boolean;
  /** Sound responses: read answers aloud when the student asks by voice. */
  voiceReplies: boolean;
};
export const DEFAULT_ASSISTANT: AssistantPreferences = { launcher: true, mascot: true, idleAnimations: true, suggestions: true, voice: true, reactions: true, voiceReplies: true };

/* ------------------------------------------------------------------ */
/* Privacy                                                             */
/* ------------------------------------------------------------------ */

export type PrivacyPreferences = {
  /** Share anonymous usage events (what features are used, never content). Off unless the student turns it on. */
  analytics: boolean;
};
export const DEFAULT_PRIVACY: PrivacyPreferences = { analytics: false };

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
  privacy: PrivacyPreferences;
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
  privacy: DEFAULT_PRIVACY,
};
