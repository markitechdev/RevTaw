import "server-only";

import { createHmac } from "node:crypto";

import { after } from "next/server";

import { getServerEnv, type ServerEnv } from "@/lib/env";
import { parsePreferences } from "@/lib/preferences/schema";
import { cronSecret } from "@/lib/server/cron-auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Product analytics (research doc §17): which RevTaw features students use,
 * sent server-side to PostHog Cloud EU only for students who turned on
 * Settings → Account → Usage analytics. No content ever leaves: events carry
 * counts and fixed labels from the allowlist below. The student is a keyed
 * hash of their id (no name, email or IP-based location), and events create
 * no person profiles. Nothing runs in the browser, so there are no cookies.
 *
 * The hash key comes from a server-only secret (SUPABASE_SECRET_KEY, else
 * CRON_SECRET), never from POSTHOG_KEY: PostHog project keys are public by
 * design, and with one anybody holding an account id could recompute the
 * pseudonym. Rotating that secret starts new pseudonyms.
 */

const DEFAULT_HOST = "https://eu.i.posthog.com";

type Primitive = string | number | boolean | null;

/** Every event RevTaw may send, with the only properties it may carry. */
export const ANALYTICS_EVENTS = {
  material_processed: ["source", "status", "method", "chunks"],
  quiz_created: ["questions", "mode", "difficulty"],
  flashcards_created: ["cards"],
  reviewer_created: ["format"],
  tamari_message: ["mode", "grounding", "provider"],
  study_session_completed: ["minutes", "questions"],
  voice_transcribed: ["provider"],
  calendar_connected: [],
} as const satisfies Record<string, readonly string[]>;

export type AnalyticsEvent = keyof typeof ANALYTICS_EVENTS;

/** The key for students' pseudonyms, derived from a server-only secret; null when there is none. */
function pseudonymKey(env: ServerEnv): string | null {
  const root = env.SUPABASE_SECRET_KEY ?? cronSecret();
  return root ? createHmac("sha256", root).update("revtaw-analytics-pseudonym-v1").digest("base64url") : null;
}

export function analyticsConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.POSTHOG_KEY && pseudonymKey(env));
}

let warnedNoSecret = false;

/** A stable pseudonym for the student that PostHog cannot turn back into their account id. */
export function analyticsId(userId: string, key: string): string {
  return createHmac("sha256", key).update(`revtaw-analytics:${userId}`).digest("base64url").slice(0, 32);
}

/** Keeps only the allowlisted properties, as short plain values. */
export function cleanProperties(event: AnalyticsEvent, properties: Record<string, unknown>): Record<string, Primitive> {
  const allowed = ANALYTICS_EVENTS[event] as readonly string[];
  const clean: Record<string, Primitive> = {};
  for (const name of allowed) {
    const value = properties[name];
    if (typeof value === "number" && Number.isFinite(value)) clean[name] = value;
    else if (typeof value === "boolean" || value === null) clean[name] = value;
    else if (typeof value === "string") clean[name] = value.slice(0, 60);
  }
  return clean;
}

export function capturePayload(apiKey: string, distinctId: string, event: AnalyticsEvent, properties: Record<string, unknown>, now = new Date()) {
  return {
    api_key: apiKey,
    event,
    distinct_id: distinctId,
    timestamp: now.toISOString(),
    properties: { ...cleanProperties(event, properties), $process_person_profile: false, $geoip_disable: true, $lib: "revtaw-server" },
  };
}

/**
 * Records one event for the signed-in student after the response is sent,
 * if analytics is set up and they opted in. Never throws.
 */
export function track(userId: string, event: AnalyticsEvent, properties: Record<string, unknown> = {}): void {
  const env = getServerEnv();
  if (!env.POSTHOG_KEY) return;
  const key = pseudonymKey(env);
  if (!key) {
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.warn("analytics: POSTHOG_KEY is set, but analytics stays off until the server has SUPABASE_SECRET_KEY or CRON_SECRET to make pseudonyms from.");
    }
    return;
  }
  const apiKey = env.POSTHOG_KEY;
  const host = (env.POSTHOG_HOST ?? DEFAULT_HOST).replace(/\/+$/, "");
  const now = new Date();
  // Read the session now, while the request is in scope.
  const client = createClient().catch(() => null);
  const run = async () => {
    try {
      const supabase = await client;
      if (!supabase) return;
      const { data: profile } = await supabase.from("profiles").select("preferences").eq("id", userId).maybeSingle();
      if (!parsePreferences(profile?.preferences ?? {}).privacy.analytics) return;
      await fetch(`${host}/i/v0/e/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(capturePayload(apiKey, analyticsId(userId, key), event, properties, now)),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      console.warn("analytics: event not sent", error instanceof Error ? error.message : error);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
