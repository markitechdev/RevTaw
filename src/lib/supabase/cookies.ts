import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Secure cookies only where the site is served over https: the live site
 * (NEXT_PUBLIC_SITE_URL) and every Vercel deployment. A production build
 * served over plain http on this machine keeps working.
 */
const servedOverTls = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://") || process.env.VERCEL === "1";

/**
 * Options for Supabase's session cookies, shared by every client that reads
 * or writes them (server.ts, auth-client.ts, proxy.ts). Only RevTaw's server
 * reads the session (there is no browser Supabase client), so page scripts
 * cannot (httpOnly); on https they are never sent over plain http (secure);
 * and other sites' requests carry them only on top-level navigations, such as
 * a link in an email (lax).
 */
export const SESSION_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: servedOverTls,
};
