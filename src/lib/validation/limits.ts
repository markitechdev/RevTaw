/**
 * Length limits for the account forms. Zod-free, so the browser gets them
 * (as input attributes) without downloading the validators; the schemas in
 * `auth.ts` enforce the same limits on the server and re-export these.
 */

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt (used by Supabase Auth) only considers the first 72 bytes.
export const PASSWORD_MAX_LENGTH = 72;
export const DISPLAY_NAME_MAX_LENGTH = 80;
