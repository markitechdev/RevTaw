import { routes } from "@/lib/routes";

/**
 * Email links that open /auth/confirm (supabase/README.md has the
 * templates). The page only shows a button; the link is used when the
 * student presses it, so mail scanners that open every link (Microsoft Safe
 * Links, school filters) cannot use it up, and a link alone signs no one in.
 */

/** The email links RevTaw sends. Magic links and invites are never sent, so they are refused. */
export const CONFIRM_TYPES = ["signup", "email", "recovery", "email_change"] as const;

export type ConfirmType = (typeof CONFIRM_TYPES)[number];

export function isConfirmType(value: string): value is ConfirmType {
  return (CONFIRM_TYPES as readonly string[]).includes(value);
}

/** A token hash from an email template: hex, with a "pkce_" prefix for links started on the server. */
export function isTokenHash(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,512}$/.test(value);
}

/** Where a confirmed link continues to, unless the link names its own (same-site) `next`. */
export const CONFIRM_NEXT: Record<ConfirmType, string> = {
  signup: `${routes.onboarding}?verified=1`,
  email: `${routes.onboarding}?verified=1`,
  recovery: routes.resetPassword,
  email_change: `${routes.settingsAccount}?notice=email-updated`,
};

/** The page that can send a fresh link when this one has expired or was already used. */
export function confirmFailurePath(type: ConfirmType): string {
  if (type === "recovery") return `${routes.forgotPassword}?error=expired`;
  if (type === "signup" || type === "email") return `${routes.verifyEmail}?error=expired`;
  return `${routes.login}?error=link`;
}

export const CONFIRM_COPY: Record<ConfirmType, { title: string; description: string; button: string }> = {
  signup: {
    title: "Confirm your email",
    description: "Press the button to verify your email and finish setting up your RevTaw account.",
    button: "Confirm my email",
  },
  email: {
    title: "Confirm your email",
    description: "Press the button to verify your email and finish setting up your RevTaw account.",
    button: "Confirm my email",
  },
  recovery: {
    title: "Reset your password",
    description: "Press the button to continue to choosing a new password.",
    button: "Continue",
  },
  email_change: {
    title: "Confirm your new email",
    description: "Press the button to start using this address for your RevTaw account.",
    button: "Confirm new email",
  },
};
