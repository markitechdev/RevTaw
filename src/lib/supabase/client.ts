"use client";

import { createBrowserClient } from "@supabase/ssr";

import { browserSupabaseConfig } from "@/lib/public-env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Supabase client for Client Components.
 *
 * Only the public URL and publishable key reach the browser; every query is
 * still subject to row-level security on the database side.
 */
export function createClient() {
  const { url, publishableKey } = browserSupabaseConfig();
  return createBrowserClient<Database>(url, publishableKey);
}
