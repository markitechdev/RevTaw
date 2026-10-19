import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getPublicEnv, getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Privileged Supabase client backed by the secret (service-role) key.
 *
 * It bypasses row-level security, so it must only be used for operations the
 * signed-in user is not allowed to perform directly — currently deleting the
 * user's own account. Never pass it user-controlled filters without checking
 * ownership first, and never import it from client code.
 *
 * Returns null when `SUPABASE_SECRET_KEY` is not configured so callers can
 * degrade gracefully.
 */
export function createAdminClient() {
  const { SUPABASE_SECRET_KEY } = getServerEnv();
  if (!SUPABASE_SECRET_KEY) {
    return null;
  }

  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();

  return createSupabaseClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}
