import { describe, expect, it } from "vitest";

import { activeSeconds, attemptFocusSeconds, IDLE_GAP_SECONDS, sessionFocusSeconds, sessionLinkedAttempts } from "@/lib/study/focus";

describe("focus time", () => {
  it("counts a plan's blocks, not the plan as well", () => {
    expect(sessionFocusSeconds({ method: "smart_study", focus_seconds: 1800 })).toBe(0);
    expect(sessionFocusSeconds({ method: "custom_routine", focus_seconds: 1200 })).toBe(0);
    expect(sessionFocusSeconds({ method: "pre_testing", focus_seconds: 900 })).toBe(0);
    expect(sessionFocusSeconds({ method: "active_recall", focus_seconds: 600 })).toBe(600);
  });

  it("knows which attempts a session already carries", () => {
    expect(sessionLinkedAttempts([{ quiz_attempt_id: "a" }, { quiz_attempt_id: null }, { quiz_attempt_id: "b" }])).toEqual(new Set(["a", "b"]));
  });

  it("caps an attempt's time by its limit", () => {
    expect(attemptFocusSeconds({ started_at: "2026-10-24T01:00:00Z", submitted_at: "2026-10-24T01:30:00Z", time_limit_seconds: 600 })).toBe(600);
    expect(attemptFocusSeconds({ started_at: "2026-10-24T01:00:00Z", submitted_at: "2026-10-24T01:05:00Z", time_limit_seconds: null })).toBe(300);
    expect(attemptFocusSeconds({ started_at: "2026-10-24T01:00:00Z", submitted_at: null, time_limit_seconds: null })).toBe(0);
  });

  it("counts the time spent answering, not a night the session was left open", () => {
    const start = "2026-10-24T13:00:00Z";
    // Three answers ten minutes apart, finished five minutes after the last one.
    expect(activeSeconds(start, ["2026-10-24T13:10:00Z", "2026-10-24T13:20:00Z", "2026-10-24T13:30:00Z"], new Date("2026-10-24T13:35:00Z"))).toBe(35 * 60);
    // Left open overnight, one more answer and Finish the next morning: the night counts as one idle gap.
    const overnight = activeSeconds(start, ["2026-10-24T13:10:00Z", "2026-10-25T08:00:00Z"], new Date("2026-10-25T08:01:00Z"));
    expect(overnight).toBe(10 * 60 + IDLE_GAP_SECONDS + 60);
    // Answers out of order, before the start or after the end are read in order or left out.
    expect(activeSeconds(start, ["2026-10-24T13:20:00Z", null, "2026-10-24T12:00:00Z", "2026-10-24T13:10:00Z"], new Date("2026-10-24T13:20:00Z"))).toBe(20 * 60);
    expect(activeSeconds(start, [], new Date(start))).toBe(0);
  });
});
