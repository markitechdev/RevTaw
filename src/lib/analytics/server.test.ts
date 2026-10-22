import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deferred: Array<() => Promise<void>> = [];
let storedPreferences: unknown = {};

vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => deferred.push(task) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { preferences: storedPreferences } }) }) }) }),
  }),
}));

import { analyticsConfigured, analyticsId, capturePayload, cleanProperties, track } from "@/lib/analytics/server";

const USER = "0e6e7e4a-5b1c-4d2e-8f3a-9b8c7d6e5f40";

beforeEach(() => {
  deferred.length = 0;
  storedPreferences = {};
  vi.stubEnv("POSTHOG_KEY", "phc_test");
  vi.stubEnv("POSTHOG_HOST", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  vi.stubEnv("CRON_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function flush() {
  while (deferred.length) await deferred.shift()!();
}

describe("analytics", () => {
  it("uses a keyed pseudonym, never the account id", () => {
    const id = analyticsId(USER, "phc_test");
    expect(id).toMatch(/^[\w-]{32}$/);
    expect(id).not.toContain(USER.slice(0, 8));
    expect(analyticsId(USER, "phc_test")).toBe(id);
    expect(analyticsId(USER, "phc_other")).not.toBe(id);
  });

  it("keeps only allowlisted, plain properties", () => {
    expect(cleanProperties("tamari_message", { mode: "tutor", grounding: "material", provider: "groq", question: "What is my secret?", extra: 1 })).toEqual({ mode: "tutor", grounding: "material", provider: "groq" });
    expect(cleanProperties("quiz_created", { questions: 10, mode: { nested: true }, difficulty: "x".repeat(100) })).toEqual({ questions: 10, difficulty: "x".repeat(60) });
  });

  it("sends anonymous events without person profiles or location", () => {
    const pseudonym = analyticsId(USER, "server-only-key");
    const payload = capturePayload("phc_test", pseudonym, "calendar_connected", {}, new Date("2026-10-22T01:00:00Z"));
    expect(payload).toEqual({
      api_key: "phc_test",
      event: "calendar_connected",
      distinct_id: pseudonym,
      timestamp: "2026-10-22T01:00:00.000Z",
      properties: { $process_person_profile: false, $geoip_disable: true, $lib: "revtaw-server" },
    });
  });

  it("sends nothing unless the student opted in, and goes to PostHog EU when they did", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    track(USER, "quiz_created", { questions: 5 });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();

    storedPreferences = { privacy: { analytics: true } };
    track(USER, "quiz_created", { questions: 5, mode: "exam" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://eu.i.posthog.com/i/v0/e/");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ event: "quiz_created", properties: { questions: 5, mode: "exam" } });
    // The public project key alone can't turn an account id into the pseudonym.
    expect(body.distinct_id).toMatch(/^[\w-]{32}$/);
    expect(body.distinct_id).not.toBe(analyticsId(USER, "phc_test"));
  });

  it("stays off without a server secret to make pseudonyms from", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    storedPreferences = { privacy: { analytics: true } };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(analyticsConfigured()).toBe(false);
    track(USER, "quiz_created");
    await flush();
    expect(deferred).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("CRON_SECRET", "a-long-scheduler-secret");
    expect(analyticsConfigured()).toBe(true);
  });

  it("does nothing when analytics is not set up", async () => {
    vi.stubEnv("POSTHOG_KEY", "");
    storedPreferences = { privacy: { analytics: true } };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    track(USER, "quiz_created");
    await flush();
    expect(deferred).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
