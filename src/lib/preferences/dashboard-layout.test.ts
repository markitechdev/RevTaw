import { describe, expect, it } from "vitest";

import { defaultDashboard, moveWidget, toggleWidget, widgetGroup } from "@/lib/preferences/dashboard-layout";
import { DEFAULT_HIDDEN_WIDGETS, WIDGET_IDS } from "@/lib/preferences/schema";

describe("dashboard layout operations", () => {
  it("groups widgets the way the dashboard draws them", () => {
    expect(widgetGroup("continue")).toBe("focus");
    expect(widgetGroup("streak")).toBe("numbers");
    expect(widgetGroup("recent")).toBe("lists");
  });

  it("moves a widget only among widgets of its own group", () => {
    const start = defaultDashboard();
    const moved = moveWidget(start, "due", -1);
    expect(moved.order.indexOf("due")).toBeLessThan(moved.order.indexOf("recommendation"));
    // "exam" is the first number; moving it up must not jump into the main area.
    expect(moveWidget(start, "exam", -1)).toBe(start);
    // The last list stays last.
    const lastList = start.order.filter((id) => widgetGroup(id) === "lists").at(-1)!;
    expect(moveWidget(start, lastList, 1)).toBe(start);
    expect(new Set(moved.order).size).toBe(WIDGET_IDS.length);
  });

  it("hides and shows widgets without changing the order", () => {
    const start = defaultDashboard();
    const hidden = toggleWidget(start, "continue", false);
    expect(hidden.hidden).toContain("continue");
    expect(hidden.order).toEqual(start.order);
    expect(toggleWidget(hidden, "continue", true).hidden).toEqual(start.hidden);
  });

  it("returns a fresh default layout each time", () => {
    const first = defaultDashboard();
    first.hidden.length = 0;
    expect(defaultDashboard().hidden).toEqual([...DEFAULT_HIDDEN_WIDGETS]);
  });
});
