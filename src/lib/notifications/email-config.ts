import "server-only";

import { isSecureEndpoint } from "@/lib/env";

/**
 * Email delivery (UI phase §27–§28, research doc §16): Resend only, from a
 * domain RevTaw owns. Credentials live only in server-side environment
 * variables — never in the repository and never in client code. Until it is
 * configured, email stays off and the settings page says so; in-app
 * reminders keep working.
 *
 *   RESEND_API_KEY → an API key with sending access (resend.com)
 *   EMAIL_FROM     → the sender on your verified domain,
 *                    e.g. "RevTaw <reminders@mail.yourdomain.com>"
 *
 * SMTP is no longer supported: it invited a personal Gmail app password,
 * Gmail caps sending near 500 a day, and mail from a gmail.com address
 * cannot carry RevTaw's own DKIM signature.
 */

export type EmailConfig = { provider: "resend"; from: string; apiKey: string; apiUrl: string };

const warned = new Set<string>();

function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

export function emailConfig(): EmailConfig | null {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (provider && provider !== "resend") {
    warnOnce(`email: EMAIL_PROVIDER=${provider} is no longer supported. RevTaw sends email through Resend only (RESEND_API_KEY and EMAIL_FROM).`);
    return null;
  }
  const from = process.env.EMAIL_FROM?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!from || !apiKey) return null;
  // RESEND_API_URL is for tests or a proxy; production uses Resend's API.
  // The key goes in a header, so only https (or localhost) is accepted.
  const apiUrl = (process.env.RESEND_API_URL?.trim() || "https://api.resend.com").replace(/\/+$/, "");
  if (!isSecureEndpoint(apiUrl)) {
    warnOnce("email: RESEND_API_URL must start with https:// (http:// only for localhost). Email is off until it does.");
    return null;
  }
  return { provider: "resend", from, apiKey, apiUrl };
}

export function isEmailConfigured(): boolean {
  return emailConfig() !== null;
}
