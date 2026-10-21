import "server-only";

import { emailConfig, type EmailConfig } from "@/lib/notifications/email-config";

/**
 * Sends one email through the configured provider (UI phase §28): Resend's
 * HTTP API or SMTP (for example a RevTaw Gmail account with an app
 * password). Credentials come only from server environment variables and
 * never appear in errors or logs.
 */

export type EmailMessage = { to: string; subject: string; text: string; html: string };
export type EmailResult = { ok: true } | { ok: false; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

function safeError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/\s+/g, " ").slice(0, 200) || "unknown error";
}

export async function sendEmail(message: EmailMessage, config: EmailConfig | null = emailConfig()): Promise<EmailResult> {
  if (!config) return { ok: false, error: "Email is not configured." };
  try {
    if (config.provider === "resend") {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return { ok: true };
      const body = (await response.json().catch(() => null)) as { message?: string; name?: string } | null;
      return { ok: false, error: `Resend ${response.status}: ${safeError(body?.message ?? body?.name ?? response.statusText)}` };
    }
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    await transport.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}
