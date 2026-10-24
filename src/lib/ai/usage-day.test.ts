import { describe, expect, it } from "vitest";

import { addDays, DEFAULT_TIMEZONE, todayIn } from "@/lib/planner/dates";
import { zonedInstant } from "@/lib/planner/time";

describe("the AI usage day (RevTaw's home zone, as in the SQL)", () => {
  it("turns over at midnight in Manila, not at midnight UTC", () => {
    const lateEvening = new Date("2026-10-24T15:59:00Z"); // 23:59 in Manila
    const justAfter = new Date("2026-10-24T16:01:00Z"); // 00:01 the next day in Manila
    expect(todayIn(DEFAULT_TIMEZONE, lateEvening)).toBe("2026-10-24");
    expect(todayIn(DEFAULT_TIMEZONE, justAfter)).toBe("2026-10-25");
    expect(zonedInstant(addDays("2026-10-24", 1), "00:00", DEFAULT_TIMEZONE).toISOString()).toBe("2026-10-24T16:00:00.000Z");
  });
});
