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
  methods: "/methods",
  quiz: "/quiz",
  flashcards: "/flashcards",
  tutor: "/tutor",
  notes: "/notes",
  progress: "/progress",
  planner: "/planner",
  settings: "/settings",
  settingsProfile: "/settings/profile",
  settingsPreferences: "/settings/preferences",
  settingsAccount: "/settings/account",
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
  routes.resetPassword,
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

/**
 * Validates a `next` redirect target supplied through the URL. Only same-site
 * absolute paths are accepted, which prevents open-redirect abuse.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback: string = routes.dashboard,
): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  if (/[\r\n]/.test(value)) return fallback;
  return value;
}
