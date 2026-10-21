import "server-only";

/**
 * Email delivery settings (UI phase §27–§28). Credentials live only in
 * server-side environment variables — never in the repository and never in
 * client code. Until a provider is configured, email reminders stay off and
 * the settings page says so; in-app reminders keep working.
 *
 *   EMAIL_PROVIDER=resend  → RESEND_API_KEY
 *   EMAIL_PROVIDER=smtp    → SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
 *                            (e.g. a RevTaw Gmail account with an app password)
 *   EMAIL_FROM             → the sender, e.g. "RevTaw <reminders@example.com>"
 */

export type EmailProviderId = "resend" | "smtp";

export type EmailConfig =
  | { provider: "resend"; from: string; apiKey: string }
  | { provider: "smtp"; from: string; host: string; port: number; secure: boolean; user: string; password: string };

export function emailConfig(): EmailConfig | null {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const from = process.env.EMAIL_FROM?.trim();
  if (!provider || !from) return null;
  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    return apiKey ? { provider, from, apiKey } : null;
  }
  if (provider === "smtp") {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD;
    const port = Number(process.env.SMTP_PORT ?? 465);
    if (!host || !user || !password || !Number.isInteger(port) || port <= 0) return null;
    return { provider, from, host, port, secure: (process.env.SMTP_SECURE ?? (port === 465 ? "true" : "false")) === "true", user, password };
  }
  return null;
}

export function isEmailConfigured(): boolean {
  return emailConfig() !== null;
}
