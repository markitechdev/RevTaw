import "server-only";

import { emailConfig, type EmailConfig } from "@/lib/notifications/email-config";

/**
 * Sends one email through Resend's HTTP API (UI phase §28, research doc
 * §16). Credentials come only from server environment variables and never
 * appear in errors or logs. An idempotency key makes a retried send a no-op
 * at Resend (for 24 hours), so a reminder or digest is never sent twice.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. List-Unsubscribe for one-click unsubscribe. */
  headers?: Record<string, string>;
  /** Same key → same email, at most once (Resend keeps keys for 24 hours). */
  idempotencyKey?: string;
};
export type EmailResult = { ok: true; id: string | null } | { ok: false; error: string };

const TIMEOUT_MS = 10_000;

function safeError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/\s+/g, " ").slice(0, 200) || "unknown error";
}

export async function sendEmail(message: EmailMessage, config: EmailConfig | null = emailConfig()): Promise<EmailResult> {
  if (!config) return { ok: false, error: "Email is not configured." };
  try {
    const response = await fetch(`${config.apiUrl}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(message.headers ? { headers: message.headers } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
    if (response.ok) return { ok: true, id: typeof body?.id === "string" ? body.id : null };
    return { ok: false, error: `Resend ${response.status}: ${safeError(body?.message ?? body?.name ?? response.statusText)}` };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}
