import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export type SessionResult = {
  response: NextResponse;
  userId: string | null;
};

/**
 * Refreshes the Supabase session for the incoming request and returns both the
 * response that carries any rotated auth cookies and the verified user id.
 *
 * Important: the returned `response` object must be the one sent back to the
 * browser (or its cookies copied onto a redirect), otherwise refreshed tokens
 * are lost and users get logged out at random.
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  const env = getPublicEnv();

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Do not add logic between client creation and getClaims(): the call both
  // refreshes an expiring session and verifies the token signature.
  const { data, error } = await supabase.auth.getClaims();
  const userId = !error && data?.claims?.sub ? data.claims.sub : null;

  return { response, userId };
}

/**
 * Builds a redirect that preserves the auth cookies written during
 * `updateSession`, so a refreshed token survives the redirect.
 */
export function redirectWithSession(
  request: NextRequest,
  sessionResponse: NextResponse,
  pathname: string,
  searchParams?: Record<string, string>,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const redirect = NextResponse.redirect(url);
  for (const cookie of sessionResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
