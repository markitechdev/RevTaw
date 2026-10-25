/**
 * Central route map. Import from here instead of hard-coding paths so that
 * navigation, redirects and the proxy stay consistent.
 */
export const routes = {
  home: "/",
  login: "/login",
  register: "/register",
  verifyEmail: "/verify-email",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  authCallback: "/auth/callback",
  authConfirm: "/auth/confirm",
  onboarding: "/onboarding",
  dashboard: "/dashboard",
  materials: "/materials",
  study: "/study",
  memoryAids: "/study/memory",
  search: "/search",
  methods: "/methods",
  quiz: "/quiz",
  mistakes: "/quiz/mistakes",
  flashcards: "/flashcards",
  tutor: "/tutor",
  notes: "/notes",
  /** Create a reviewer from a material (the Reviewer tool). */
  notesNew: "/notes/new",
  progress: "/progress",
  studyMap: "/progress/map",
  achievements: "/progress/achievements",
  planner: "/planner",
  settings: "/settings",
  settingsProfile: "/settings/profile",
  /** Study preferences: level, goal, session length and preferred methods. */
  settingsPreferences: "/settings/preferences",
  settingsAppearance: "/settings/appearance",
  settingsDashboard: "/settings/dashboard",
  settingsTools: "/settings/tools",
  settingsAi: "/settings/ai",
  settingsNotifications: "/settings/notifications",
  settingsAccount: "/settings/account",
  privacy: "/privacy",
  /** The Privacy Notice in plain words, for students under 18. */
  privacyStudents: "/privacy/students",
  terms: "/terms",
  /** Who develops RevTaw: the creator's page, for people (and search engines) looking them up. */
  about: "/about",
} as const;

/** Path prefixes that require a signed-in user. */
export const PROTECTED_PREFIXES = [
  routes.onboarding,
  routes.dashboard,
  routes.materials,
  routes.study,
  routes.methods,
  routes.quiz,
  routes.flashcards,
  routes.tutor,
  routes.notes,
  routes.progress,
  routes.planner,
  routes.settings,
  routes.search,
] as const;

/** Pages that only make sense for signed-out visitors. */
export const AUTH_ONLY_PATHS = [routes.login, routes.register] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isAuthOnlyPath(pathname: string): boolean {
  return AUTH_ONLY_PATHS.some((path) => pathname === path);
}

/** A placeholder origin: `next` targets are resolved against it and must stay on it. */
const NEXT_BASE = "https://revtaw.invalid";

/**
 * A same-site path, or null. Only absolute paths on this site are accepted,
 * which prevents open-redirect abuse and links to other sites or schemes.
 *
 * Browsers and `new URL()` drop tabs and line breaks and read `\` as `/`, so
 * `/\t/evil.example` would become `//evil.example`: those characters are
 * rejected outright, and the value is then resolved against a fixed origin
 * that it must not leave.
 */
export function sameSitePath(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(value, NEXT_BASE);
  } catch {
    return null;
  }
  if (url.origin !== NEXT_BASE) return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  // Dot segments can collapse into a protocol-relative path ("/..//host").
  return path.startsWith("//") ? null : path;
}

/** Validates a `next` redirect target supplied through the URL (see `sameSitePath`). */
export function safeNextPath(
  value: string | null | undefined,
  fallback: string = routes.dashboard,
): string {
  return sameSitePath(value) ?? fallback;
}
