import { afterEach, describe, expect, it, vi } from "vitest";

import { decryptToken, encryptToken } from "@/lib/calendar/crypto";
import { addLocalMinutes, examEvent, taskEvent, taskEventId } from "@/lib/calendar/events";
import { authorizationUrl, GOOGLE_CALENDAR_SCOPE, pkcePair } from "@/lib/calendar/google";
import { readOAuthCookie, sealOAuthCookie } from "@/lib/calendar/oauth-cookie";

const KEY = Buffer.alloc(32, 7).toString("base64");
const USER = "0e6e7e4a-5b1c-4d2e-8f3a-9b8c7d6e5f40";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("refresh token encryption", () => {
  it("round-trips and is bound to the student", () => {
    const sealed = encryptToken("1//refresh-token", USER, KEY);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("refresh-token");
    expect(decryptToken(sealed, USER, KEY)).toBe("1//refresh-token");
    expect(() => decryptToken(sealed, "22222222-2222-2222-2222-222222222222", KEY)).toThrow();
    expect(() => decryptToken(sealed, USER, Buffer.alloc(32, 8).toString("base64"))).toThrow();
    expect(encryptToken("same", USER, KEY)).not.toBe(encryptToken("same", USER, KEY));
  });
});

describe("OAuth request", () => {
  it("asks only for RevTaw's own calendar, offline, with PKCE", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_API_BASE_URL", "");
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[\w-]{43}$/);
    const url = new URL(authorizationUrl({ state: "state-abc", challenge, redirectUri: "https://revtaw.example/api/calendar/google/callback" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-123.apps.googleusercontent.com",
      redirect_uri: "https://revtaw.example/api/calendar/google/callback",
      response_type: "code",
      scope: GOOGLE_CALENDAR_SCOPE,
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state: "state-abc",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
  });

  it("keeps the state cookie for ten minutes only", () => {
    const value = { state: "s".repeat(24), verifier: "v".repeat(43), userId: USER, exp: Date.now() + 600_000 };
    expect(readOAuthCookie(sealOAuthCookie(value))).toEqual(value);
    expect(readOAuthCookie(sealOAuthCookie({ ...value, exp: Date.now() - 1 }))).toBeNull();
    expect(readOAuthCookie("not-base64-json")).toBeNull();
  });
});

describe("calendar events", () => {
  const task = { id: "6f1c2a7e-0b9d-4c55-9e1f-1234567890ab", title: "Biology review", scheduled_for: "2026-10-22", starts_at: "23:30:00", minutes: 45, status: "pending" as const, notes: "Chapter 3", reminder: "30m" as const, reminder_minutes: null };

  it("uses a fixed id Google accepts", () => {
    expect(taskEventId(task.id)).toBe("ta6f1c2a7e0b9d4c559e1f1234567890ab");
    expect(taskEventId(task.id)).toMatch(/^[a-v0-9]{5,1024}$/);
  });

  it("writes a timed activity in the student's zone, crossing midnight, with its reminder", () => {
    const event = taskEvent(task, { timeZone: "Asia/Manila", siteUrl: "https://revtaw.example/" });
    expect(event.start).toEqual({ dateTime: "2026-10-22T23:30:00", timeZone: "Asia/Manila" });
    expect(event.end).toEqual({ dateTime: "2026-10-23T00:15:00", timeZone: "Asia/Manila" });
    expect(event.reminders).toEqual({ useDefault: false, overrides: [{ method: "popup", minutes: 30 }] });
    expect(event.description).toContain("Chapter 3");
    expect(event.source.url).toBe("https://revtaw.example/planner?date=2026-10-22");
    expect(event.extendedProperties.private).toMatchObject({ revtaw: "task" });
  });

  it("writes an any-time activity as an all-day event, and marks finished ones", () => {
    const event = taskEvent({ ...task, starts_at: null, status: "done" }, { timeZone: "Asia/Manila", siteUrl: "https://r.example" });
    expect(event.start).toEqual({ date: "2026-10-22" });
    expect(event.end).toEqual({ date: "2026-10-23" });
    expect(event.summary).toBe("✓ Biology review");
    expect(event.reminders.overrides).toEqual([]);
  });

  it("changes the hash only when the content changes", () => {
    const a = taskEvent(task, { timeZone: "Asia/Manila", siteUrl: "https://r.example" });
    const b = taskEvent(task, { timeZone: "Asia/Manila", siteUrl: "https://r.example" });
    const c = taskEvent({ ...task, title: "Biology review (ch. 4)" }, { timeZone: "Asia/Manila", siteUrl: "https://r.example" });
    expect(a.extendedProperties.private.hash).toBe(b.extendedProperties.private.hash);
    expect(a.extendedProperties.private.hash).not.toBe(c.extendedProperties.private.hash);
  });

  it("writes exams as all-day events with a reminder the morning before", () => {
    const event = examEvent({ id: task.id, title: "Bio midterm", exam_date: "2026-11-03", notes: null }, { siteUrl: "https://r.example" });
    expect(event).toMatchObject({ id: "ea6f1c2a7e0b9d4c559e1f1234567890ab", summary: "Exam: Bio midterm", start: { date: "2026-11-03" }, end: { date: "2026-11-04" } });
    expect(event.reminders.overrides).toEqual([{ method: "popup", minutes: 900 }]);
  });

  it("adds minutes across days", () => {
    expect(addLocalMinutes("2026-12-31", "23:50", 20)).toEqual({ date: "2027-01-01", time: "00:10" });
    expect(addLocalMinutes("2026-10-22", "08:00", 90)).toEqual({ date: "2026-10-22", time: "09:30" });
  });
});
