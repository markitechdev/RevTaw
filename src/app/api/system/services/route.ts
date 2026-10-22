import { NextResponse } from "next/server";

import { hasCronSecret } from "@/lib/server/cron-auth";
import { aiSummary, checkAiProviders } from "@/lib/server/service-check";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Service check for whoever runs this RevTaw server: which AI providers it
 * uses, their cool-downs and recent routing, and with ?live=1 a tiny live
 * request to each one. Open it while signed in during development
 * (`npm run dev`), or anywhere with `Authorization: Bearer <CRON_SECRET>`.
 * It never returns keys, prompts or student data.
 */
export async function GET(request: Request) {
  const allowed = hasCronSecret(request) || (process.env.NODE_ENV === "development" && (await getCurrentUser()) !== null);
  if (!allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const live = new URL(request.url).searchParams.get("live") === "1";
  const body = {
    checkedAt: new Date().toISOString(),
    ai: { ...aiSummary(), ...(live ? { live: await checkAiProviders() } : {}) },
    hint: live ? undefined : "Add ?live=1 to send one tiny request to each configured service.",
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
