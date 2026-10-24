import type { NextRequest } from "next/server";

import { isAuthOnlyPath, isProtectedPath, routes } from "@/lib/routes";
import { buildContentSecurityPolicy, generateNonce, hasOwnContentSecurityPolicy } from "@/lib/security/csp";
import { redirectWithSession, updateSession } from "@/lib/supabase/proxy";

/**
 * Runs before every page request (see `config.matcher` below):
 *
 * 1. Generates a per-request nonce and Content Security Policy. Next.js reads
 *    the nonce from the request header and applies it to its own scripts; the
 *    root layout applies it to the theme bootstrap script.
 * 2. Refreshes the Supabase session so Server Components always see a valid
 *    token, and writes rotated cookies back to the response.
 * 3. Sends signed-out visitors away from protected pages (remembering where
 *    they wanted to go) and signed-in users away from the login/register pages.
 *
 * This is a convenience layer only. Every Server Action and protected page
 * re-checks the user with `getCurrentUser()`; the database enforces ownership
 * with row-level security.
 */
export async function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const { response, userId } = await updateSession(request, requestHeaders);
  const { pathname, search } = request.nextUrl;

  let outgoing = response;
  if (!userId && isProtectedPath(pathname)) {
    const next = pathname + search;
    outgoing = redirectWithSession(request, response, routes.login, { next });
  } else if (userId && isAuthOnlyPath(pathname)) {
    outgoing = redirectWithSession(request, response, routes.dashboard);
  }

  // A response header set here wins over the route's own, so routes with a stricter policy are skipped.
  if (!hasOwnContentSecurityPolicy(pathname)) {
    outgoing.headers.set("Content-Security-Policy", csp);
  }
  return outgoing;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico and common static assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
