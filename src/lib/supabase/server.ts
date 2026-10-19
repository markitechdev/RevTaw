import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * A new client is created per request (never shared). It reads the session
 * from the request cookies; writes happen in Server Actions/Route Handlers.
 * Server Components cannot set cookies, which is why `src/proxy.ts` refreshes
 * the session before any page renders.
 */
export async function createClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component: cookies are read-only there.
            // The proxy (src/proxy.ts) keeps the session fresh instead.
          }
        },
      },
    },
  );
}

export type CurrentUser = {
  id: string;
  email: string | null;
};

/**
 * Returns the verified user for the current request, or null.
 *
 * `getClaims()` validates the JWT (locally for asymmetric signing keys, via
 * the Auth server otherwise) instead of trusting cookie contents the way
 * `getSession()` does. Use it in every Server Action and protected page;
 * never rely on the proxy alone for authorization.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  const { claims } = data;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}
