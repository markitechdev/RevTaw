import { describe, expect, it } from "vitest";

import { monthGrid, shiftMonth } from "@/lib/planner/calendar";

describe("monthGrid", () => {
  it("covers whole weeks from Sunday to Saturday", () => {
    const weeks = monthGrid("2026-10");
    expect(weeks[0][0]).toBe("2026-09-27");
    expect(weeks.at(-1)?.[6]).toBe("2026-10-31");
    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it("handles months that need six rows and February", () => {
    expect(monthGrid("2026-08")).toHaveLength(6);
    const february = monthGrid("2026-02");
    expect(february[0][0]).toBe("2026-02-01");
    expect(february.at(-1)?.[6]).toBe("2026-02-28");
  });
});

describe("shiftMonth", () => {
  it("moves across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });
});
