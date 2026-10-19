import type { NextRequest } from "next/server";

import { isAuthOnlyPath, isProtectedPath, routes } from "@/lib/routes";
import { redirectWithSession, updateSession } from "@/lib/supabase/proxy";

/**
 * Runs before every page request (see `config.matcher` below):
 *
 * 1. Refreshes the Supabase session so Server Components always see a valid
 *    token, and writes rotated cookies back to the response.
 * 2. Sends signed-out visitors away from protected pages (remembering where
 *    they wanted to go) and signed-in users away from the login/register pages.
 *
 * This is a convenience layer only. Every Server Action and protected page
 * re-checks the user with `getCurrentUser()`; the database enforces ownership
 * with row-level security.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!userId && isProtectedPath(pathname)) {
    const next = pathname + search;
    return redirectWithSession(request, response, routes.login, { next });
  }

  if (userId && isAuthOnlyPath(pathname)) {
    return redirectWithSession(request, response, routes.dashboard);
  }

  return response;
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
