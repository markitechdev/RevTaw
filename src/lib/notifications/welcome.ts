import "server-only";

import { renderEmail, siteEmailOptions } from "@/lib/email/render";
import { welcomeEmail } from "@/lib/email/templates";
import { getPublicSiteUrl } from "@/lib/env";
import { sendEmail } from "@/lib/notifications/email";
import { isEmailConfigured } from "@/lib/notifications/email-config";
import { routes } from "@/lib/routes";

/**
 * The welcome email, sent once per account: onboarding calls it only the first time it is completed (the
 * profile update that marks it done matches once), and the idempotency key keeps a retried send from going
 * out twice. Without email set up it does nothing; a failed send is logged and never blocks the student.
 */
export async function sendWelcomeEmail(user: { id: string; email: string | null | undefined }, displayName: string | null): Promise<void> {
  if (!user.email || !isEmailConfigured()) return;
  const siteUrl = getPublicSiteUrl();
  const email = renderEmail(welcomeEmail({ name: displayName, link: siteUrl ? `${siteUrl.replace(/\/+$/, "")}${routes.dashboard}` : null }), siteEmailOptions(siteUrl));
  const result = await sendEmail({ to: user.email, subject: email.subject, text: email.text, html: email.html, idempotencyKey: `welcome-${user.id}` });
  if (!result.ok) console.error("welcome: email failed", result.error);
}
