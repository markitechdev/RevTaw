import { describe, expect, it } from "vitest";

import { formatClock, isClockTime, zonedInstant } from "@/lib/planner/time";

describe("zonedInstant", () => {
  it("turns Manila wall time into UTC", () => {
    expect(zonedInstant("2026-10-21", "14:30", "Asia/Manila").toISOString()).toBe("2026-10-21T06:30:00.000Z");
    expect(zonedInstant("2026-10-21", "00:15:00", "Asia/Manila").toISOString()).toBe("2026-10-20T16:15:00.000Z");
  });

  it("treats unknown zones as RevTaw's home zone (Manila)", () => {
    expect(zonedInstant("2026-10-21", "09:00", null).toISOString()).toBe("2026-10-21T01:00:00.000Z");
    expect(zonedInstant("2026-10-21", "09:00", "Mars/Olympus").toISOString()).toBe("2026-10-21T01:00:00.000Z");
  });

  it("follows daylight saving time", () => {
    expect(zonedInstant("2026-07-01", "09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedInstant("2026-12-01", "09:00", "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });
});

describe("clock times", () => {
  it("validates and formats them", () => {
    expect(formatClock("14:30:00")).toBe("2:30 PM");
    expect(formatClock("00:05")).toBe("12:05 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
    expect(isClockTime("23:59")).toBe(true);
    expect(isClockTime("24:00")).toBe(false);
  });
});
