import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv, getServerEnv } from "@/lib/env";
import { getClientAddress } from "@/lib/rate-limit";
import type { Database } from "@/lib/supabase/database.types";
import { forwardableAddress } from "@/lib/supabase/forwarding";

/**
 * Supabase Auth for the calls RevTaw makes from its server on a student's
 * behalf: sign-up, sign-in, reset emails, email links, password changes.
 *
 * Supabase limits these per IP address, and from a server every student
 * would share the server's few addresses. With the secret key, Supabase
 * accepts the student's own address in `Sb-Forwarded-For` (when "IP address
 * forwarding" is on under Authentication → Rate Limits), so its limits apply
 * per student. Without the secret key it uses the publishable key as before.
 *
 * Only the `auth` API is returned: a client holding the secret key must never
 * be used for data queries. Session cookies are read and written exactly
 * like the regular server client's.
 */
export async function createAuthClient() {
  const env = getPublicEnv();
  const secret = getServerEnv().SUPABASE_SECRET_KEY;
  const address = secret ? forwardableAddress(await getClientAddress()) : null;
  const cookieStore = await cookies();

  const client = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    address && secret ? secret : env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
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
          }
        },
      },
      ...(address ? { global: { headers: { "sb-forwarded-for": address } } } : {}),
    },
  );
  return client.auth;
}
