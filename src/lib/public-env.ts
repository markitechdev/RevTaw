/**
 * The public Supabase settings as the browser sees them: Next.js replaces
 * each `process.env.NEXT_PUBLIC_…` reference below with its value at build
 * time. Zod-free on purpose (zod would add about 30 KB to every page);
 * getPublicEnv in `env.ts` validates the same variables with zod on the
 * server, on every request. This only fails loudly if a build was made
 * without them.
 */
export function browserSupabaseConfig(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("RevTaw is not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set when the app is built.");
  }
  return { url, publishableKey };
}
