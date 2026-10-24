/** Shared by the Turnstile widget (browser) and its check (server, ./turnstile.ts). */

/** The hidden field the widget writes its one-time token into. */
export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";

/** The form a token was solved for. Each form sets its own; the server expects it back. */
export type TurnstileAction = "login" | "register" | "forgot" | "resend";
