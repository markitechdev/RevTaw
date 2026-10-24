import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Options for Supabase's session cookies, shared by every client that reads
 * or writes them (server.ts, auth-client.ts, proxy.ts). Only RevTaw's server
 * reads the session (there is no browser Supabase client), so page scripts
 * cannot (httpOnly); in production they travel over https only (secure); and
 * other sites' requests carry them only on top-level navigations, such as a
 * link in an email (lax).
 */
export const SESSION_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};
