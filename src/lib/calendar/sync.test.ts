import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const google = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
  listEvents: vi.fn(),
  putEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => void task() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/calendar/google", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calendar/google")>()),
  ...google,
  calendarConfigured: () => true,
}));

import { encryptToken } from "@/lib/calendar/crypto";
import { CalendarAuthError } from "@/lib/calendar/google";
import { forgetCalendarToken, grantFingerprint, reconcileAllCalendars, reconcileCalendar } from "@/lib/calendar/sync";

const KEY = Buffer.alloc(32, 7).toString("base64");
const USER = "0e6e7e4a-5b1c-4d2e-8f3a-9b8c7d6e5f40";

type Call = { table: string; method: string; args: unknown[] };

/** Just enough of a Supabase client for the sync: rows per table (a range() reads a slice, at most 1,000 rows as on Supabase), and a log of filters and updates. */
function fakeClient(single: Record<string, unknown>, rows: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      let slice: [number, number] | null = null;
      for (const method of ["select", "eq", "gte", "lte", "in", "is", "order", "limit", "range", "update"]) {
        chain[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          if (method === "range") slice = [Number(args[0]), Math.min(Number(args[1]), Number(args[0]) + 999)];
          return chain;
        };
      }
      chain.maybeSingle = async () => ({ data: single[table] ?? null, error: null });
      chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        const all = rows[table] ?? [];
        return Promise.resolve({ data: slice ? all.slice(slice[0], slice[1] + 1) : all, error: null }).then(resolve, reject);
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

beforeEach(() => {
  vi.stubEnv("CALENDAR_TOKEN_KEY", KEY);
  google.refreshAccessToken.mockReset().mockResolvedValue({ accessToken: "ya29.first", expiresIn: 3600 });
  google.listEvents.mockReset().mockResolvedValue(new Map());
  forgetCalendarToken(USER);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("calendar sync", () => {
  it("reuses an access token only for the grant it came from", async () => {
    const first = encryptToken("1//first-grant", USER, KEY);
    const { client } = fakeClient({ calendar_connections: { calendar_id: "cal-1", refresh_token: first, status: "connected" }, profiles: { timezone: "Asia/Manila" } });
    await reconcileCalendar(client, USER);
    await reconcileCalendar(client, USER);
    expect(google.refreshAccessToken).toHaveBeenCalledTimes(1);

    // Reconnected (perhaps as another Google account): a new grant, so a new token.
    const second = encryptToken("1//second-grant", USER, KEY);
    expect(grantFingerprint(second)).not.toBe(grantFingerprint(first));
    const { client: reconnected } = fakeClient({ calendar_connections: { calendar_id: "cal-2", refresh_token: second, status: "connected" }, profiles: { timezone: "Asia/Manila" } });
    await reconcileCalendar(reconnected, USER);
    expect(google.refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(google.refreshAccessToken).toHaveBeenLastCalledWith("1//second-grant");
  });

  it("asks the student to reconnect when the saved access can't be read", async () => {
    const sealedWithOldKey = encryptToken("1//grant", USER, Buffer.alloc(32, 9).toString("base64"));
    const { client, calls } = fakeClient({ calendar_connections: { calendar_id: "cal-1", refresh_token: sealedWithOldKey, status: "connected" } });
    await expect(reconcileCalendar(client, USER)).rejects.toBeInstanceOf(CalendarAuthError);
    expect(google.refreshAccessToken).not.toHaveBeenCalled();
    const update = calls.find((call) => call.method === "update");
    expect(update?.args[0]).toMatchObject({ status: "needs_reconnect", last_error: expect.stringMatching(/Reconnect Google Calendar/) });
  });

  it("removes stale events only when it read every activity in the window", async () => {
    const sealed = encryptToken("1//grant", USER, KEY);
    const connection = { calendar_connections: { calendar_id: "cal-1", refresh_token: sealed, status: "connected" }, profiles: { timezone: "Asia/Manila" } };
    const task = (index: number) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, title: `Task ${index}`, scheduled_for: "2026-10-26", starts_at: null, minutes: 30, status: "pending", notes: null, reminder: null, reminder_minutes: null });
    const stale = `ta${"f".repeat(32)}`;
    google.listEvents.mockResolvedValue(new Map([[stale, "old"]]));
    google.putEvent.mockReset().mockResolvedValue(undefined);
    google.deleteEvent.mockReset().mockResolvedValue(undefined);

    // 2,500 activities: the run reads 2,000, so an event it did not write may belong to one of the rest.
    const crowded = fakeClient(connection, { study_tasks: Array.from({ length: 2500 }, (_, index) => task(index)), exams: [] });
    expect(await reconcileCalendar(crowded.client, USER)).toEqual({ written: 2000, removed: 0, unchanged: 0 });
    expect(crowded.calls.filter((call) => call.table === "study_tasks" && call.method === "range").map((call) => call.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(google.deleteEvent).not.toHaveBeenCalled();

    // Read in full: the stale event goes.
    const { client } = fakeClient(connection, { study_tasks: [task(1)], exams: [] });
    expect(await reconcileCalendar(client, USER)).toEqual({ written: 1, removed: 1, unchanged: 0 });
    expect(google.deleteEvent).toHaveBeenCalledWith(expect.any(String), "cal-1", stale);
  });

  it("retries failed syncs in the hourly job, but not connections waiting for the student", async () => {
    const { client, calls } = fakeClient({}, { calendar_connections: [] });
    await reconcileAllCalendars(client);
    expect(calls).toContainEqual({ table: "calendar_connections", method: "in", args: ["status", ["connected", "error"]] });
  });
});
