import { describe, expect, it } from "vitest";

import { durationPhrase, reminderLabel, remindAtFor, startPhrase } from "@/lib/reminders/time";

describe("remindAtFor", () => {
  it("subtracts the offset from the start", () => {
    expect(remindAtFor({ date: "2026-10-21", time: "14:30", reminder: "30m", reminderMinutes: null, timeZone: "Asia/Manila" })?.toISOString()).toBe("2026-10-21T06:00:00.000Z");
    expect(remindAtFor({ date: "2026-10-21", time: "14:30", reminder: "1d", reminderMinutes: null, timeZone: "Asia/Manila" })?.toISOString()).toBe("2026-10-20T06:30:00.000Z");
    expect(remindAtFor({ date: "2026-10-21", time: "14:30", reminder: "custom", reminderMinutes: 120, timeZone: "Asia/Manila" })?.toISOString()).toBe("2026-10-21T04:30:00.000Z");
  });

  it("uses 8:00 AM for activities without a time, and null for no reminder", () => {
    expect(remindAtFor({ date: "2026-10-21", time: null, reminder: "at_time", reminderMinutes: null, timeZone: "Asia/Manila" })?.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect(remindAtFor({ date: "2026-10-21", time: "14:30", reminder: "none", reminderMinutes: null, timeZone: "Asia/Manila" })).toBeNull();
    expect(remindAtFor({ date: "2026-10-21", time: "14:30", reminder: "custom", reminderMinutes: null, timeZone: "Asia/Manila" })).toBeNull();
  });
});

describe("words", () => {
  it("formats durations and reminder settings", () => {
    expect(durationPhrase(90)).toBe("90 minutes");
    expect(durationPhrase(120)).toBe("2 hours");
    expect(durationPhrase(2880)).toBe("2 days");
    expect(reminderLabel("custom", 180)).toBe("3 hours before");
    expect(reminderLabel("at_time", null)).toBe("At the time");
  });

  it("describes the start from the reminder's point of view", () => {
    const zone = "Asia/Manila";
    expect(startPhrase({ date: "2026-10-21", time: "14:30", remindAt: new Date("2026-10-21T06:00:00Z"), timeZone: zone })).toBe("in 30 minutes");
    expect(startPhrase({ date: "2026-10-21", time: "14:30", remindAt: new Date("2026-10-21T05:30:00Z"), timeZone: zone })).toBe("in 1 hour");
    expect(startPhrase({ date: "2026-10-21", time: "14:30", remindAt: new Date("2026-10-21T06:30:00Z"), timeZone: zone })).toBe("now");
    expect(startPhrase({ date: "2026-10-22", time: "14:30", remindAt: new Date("2026-10-21T06:30:00Z"), timeZone: zone })).toBe("tomorrow at 2:30 PM");
    expect(startPhrase({ date: "2026-10-21", time: null, remindAt: new Date("2026-10-21T00:00:00Z"), timeZone: zone })).toBe("today");
  });
});
