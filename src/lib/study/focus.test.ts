import { describe, expect, it } from "vitest";

import { attemptFocusSeconds, sessionFocusSeconds, sessionLinkedAttempts } from "@/lib/study/focus";

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
});
