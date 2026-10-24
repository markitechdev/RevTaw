import { NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";
import { normalizeQuickQuery, quickSearch } from "@/lib/search/quick";
import { getCurrentUser } from "@/lib/supabase/server";

/** Type-ahead results for the command menu (Ctrl/Cmd+K). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  // Debounced typing makes a few requests a second at most.
  const limit = await rateLimit(`quick-search:${user.id}`, 120, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many searches at once. Try again in a moment." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  }
  const query = normalizeQuickQuery(new URL(request.url).searchParams.get("q") ?? "");
  const results = await quickSearch(query);
  return NextResponse.json({ query, results }, { headers: { "cache-control": "private, no-store" } });
}
