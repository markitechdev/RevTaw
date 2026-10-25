import { BRAND } from "@/lib/brand";
import { renderEmail, type EmailContent } from "@/lib/email/render";
import { confirmSignupEmail, emailChangeEmail, passwordChangedEmail, resetPasswordEmail } from "@/lib/email/templates";
import { routes } from "@/lib/routes";

/**
 * The emails Supabase Auth sends, in RevTaw's design: rendered from the same templates as the app's emails,
 * kept in supabase/templates (auth-templates.test.ts checks they match) and pasted into the Supabase dashboard
 * (supabase/README.md has the steps and the subject lines).
 *
 * Supabase fills in the {{ .Placeholders }}. The links open RevTaw's /auth/confirm page, which uses a link
 * only when the student presses its button, so mail scanners that open every link can't use it up.
 */

const SITE = "{{ .SiteURL }}";
/** How long Supabase's email links work (Email OTP Expiration in the dashboard; 3600 seconds by default). */
export const LINK_EXPIRY = "1 hour";

const confirmLink = (type: "signup" | "recovery" | "email_change") => `${SITE}${routes.authConfirm}?token_hash={{ .TokenHash }}&type=${type}`;

export type SupabaseTemplate = {
  /** The file in supabase/templates. */
  file: string;
  /** The template's name in the Supabase dashboard. */
  name: string;
  /** Authentication emails always go out; a security notification goes out once it is switched on. */
  kind: "authentication" | "notification";
  content: EmailContent;
};

export const SUPABASE_TEMPLATES: readonly SupabaseTemplate[] = [
  { file: "confirm-signup.html", name: "Confirm sign up", kind: "authentication", content: confirmSignupEmail({ link: confirmLink("signup"), expiry: LINK_EXPIRY }) },
  { file: "reset-password.html", name: "Reset password", kind: "authentication", content: resetPasswordEmail({ link: confirmLink("recovery"), expiry: LINK_EXPIRY }) },
  {
    file: "change-email.html",
    name: "Change email address",
    kind: "authentication",
    content: emailChangeEmail({ link: confirmLink("email_change"), currentEmail: "{{ .Email }}", newEmail: "{{ .NewEmail }}", expiry: LINK_EXPIRY }),
  },
  { file: "password-changed.html", name: "Password changed", kind: "notification", content: passwordChangedEmail({ email: "{{ .Email }}", secureLink: `${SITE}${routes.forgotPassword}` }) },
];

/** The HTML to paste into the dashboard: images and links from the Site URL Supabase fills in. */
export function supabaseTemplateHtml(template: SupabaseTemplate): string {
  return renderEmail(template.content, { assetBase: SITE, site: { href: SITE, label: BRAND.domain } }).html;
}
