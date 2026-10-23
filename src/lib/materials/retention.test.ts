import { describe, expect, it } from "vitest";

import { ARCHIVE_DAYS, archiveCutoff, dayLabel, daysUntilPurge, purgeCountdown, purgeDueAt } from "@/lib/materials/retention";

describe("archive retention", () => {
  const archived = "2026-10-23T08:00:00.000Z";

  it("deletes permanently 30 days after archiving", () => {
    expect(ARCHIVE_DAYS).toBe(30);
    expect(purgeDueAt(archived).toISOString()).toBe("2026-11-22T08:00:00.000Z");
    expect(archiveCutoff(new Date("2026-11-22T08:00:00.000Z")).toISOString()).toBe(archived);
  });

  it("counts the days left, rounding up, and never below zero", () => {
    expect(daysUntilPurge(archived, new Date(archived))).toBe(30);
    expect(daysUntilPurge(archived, new Date("2026-10-23T09:00:00.000Z"))).toBe(30);
    expect(daysUntilPurge(archived, new Date("2026-11-21T07:00:00.000Z"))).toBe(2);
    expect(daysUntilPurge(archived, new Date("2026-11-21T09:00:00.000Z"))).toBe(1);
    expect(daysUntilPurge(archived, new Date("2026-11-22T08:00:00.000Z"))).toBe(0);
    expect(daysUntilPurge(archived, new Date("2026-12-01T00:00:00.000Z"))).toBe(0);
  });

  it("says when in words", () => {
    expect(purgeCountdown(archived, new Date(archived))).toBe("in 30 days");
    expect(purgeCountdown(archived, new Date("2026-11-21T09:00:00.000Z"))).toBe("tomorrow");
    expect(purgeCountdown(archived, new Date("2026-11-22T09:00:00.000Z"))).toBe("today");
  });

  it("names the day in the student's time zone", () => {
    expect(dayLabel(purgeDueAt("2026-10-23T20:00:00.000Z"), "Asia/Manila")).toBe("Nov 23, 2026");
    expect(dayLabel(purgeDueAt("2026-10-23T20:00:00.000Z"), "UTC")).toBe("Nov 22, 2026");
    expect(dayLabel("2026-10-23T20:00:00.000Z", "Not/AZone")).toMatch(/^Oct 2[34], 2026$/);
  });
});
