import type { AuthError } from "@supabase/supabase-js";

/**
 * Translates Supabase Auth errors into calm, specific messages. Raw error text
 * is never shown to students: it can leak implementation details and is often
 * phrased for developers.
 */

export const GENERIC_AUTH_ERROR =
  "Something went wrong on our side. Please try again in a moment.";

export const TOO_MANY_ATTEMPTS =
  "Too many attempts. Please wait a few minutes and try again.";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  user_already_exists: "An account with this email already exists. Try signing in instead.",
  email_exists: "An account with this email already exists. Try signing in instead.",
  email_address_invalid: "Enter a valid email address.",
  email_address_not_authorized:
    "This email address cannot be used right now. Please contact support.",
  signup_disabled: "New registrations are currently closed.",
  user_banned: "This account has been suspended. Please contact support.",
  weak_password: "Please choose a stronger password.",
  same_password: "Choose a password you have not used before.",
  otp_expired: "This link has expired or was already used. Request a new one below.",
  flow_state_expired: "This link has expired. Request a new one below.",
  flow_state_not_found:
    "This link must be opened in the same browser you started from. Request a new one below.",
  bad_code_verifier:
    "This link must be opened in the same browser you started from. Request a new one below.",
  reauthentication_needed: "For security, please sign in again before changing your password.",
  over_request_rate_limit: TOO_MANY_ATTEMPTS,
  over_email_send_rate_limit:
    "We recently sent an email to this address. Please wait a minute before requesting another.",
  validation_failed: "Please check your details and try again.",
  session_expired: "Your session has expired. Please sign in again.",
  session_not_found: "Your session has expired. Please sign in again.",
  request_timeout: "The request timed out. Please try again.",
};

export function authErrorMessage(error: AuthError | null | undefined): string {
  if (!error) return GENERIC_AUTH_ERROR;

  const code = error.code ?? "";
  if (code && MESSAGES[code]) {
    if (code === "weak_password" && "reasons" in error) {
      const reasons = (error as AuthError & { reasons?: string[] }).reasons;
      if (reasons?.includes("length")) {
        return "Please choose a longer password.";
      }
    }
    return MESSAGES[code];
  }

  if (error.status === 429) return TOO_MANY_ATTEMPTS;
  if (error.status === 422 && /password/i.test(error.message)) {
    return "Please choose a stronger password.";
  }

  return GENERIC_AUTH_ERROR;
}
