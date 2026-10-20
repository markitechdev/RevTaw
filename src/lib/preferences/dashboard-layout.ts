import { DEFAULT_DASHBOARD, WIDGET_BY_ID, type DashboardPreferences, type WidgetId } from "@/lib/preferences/schema";

/** Pure layout operations for the dashboard customizer (client-safe, unit-tested). */

/** How the dashboard draws widgets: the main area, one strip of numbers, then lists. */
export type WidgetGroup = "focus" | "numbers" | "lists";

export function widgetGroup(id: WidgetId): WidgetGroup {
  const widget = WIDGET_BY_ID[id];
  return widget.zone === "focus" ? "focus" : widget.wide ? "lists" : "numbers";
}

/** Moves a widget one place up or down among the widgets drawn in the same group. */
export function moveWidget(layout: DashboardPreferences, id: WidgetId, direction: -1 | 1): DashboardPreferences {
  const group = widgetGroup(id);
  const order = [...layout.order];
  const sameGroup = order.filter((item) => widgetGroup(item) === group);
  const index = sameGroup.indexOf(id);
  const swapWith = sameGroup[index + direction];
  if (index < 0 || !swapWith) return layout;
  const a = order.indexOf(id);
  const b = order.indexOf(swapWith);
  [order[a], order[b]] = [order[b], order[a]];
  return { order, hidden: layout.hidden };
}

export function toggleWidget(layout: DashboardPreferences, id: WidgetId, visible: boolean): DashboardPreferences {
  const hidden = new Set(layout.hidden);
  if (visible) hidden.delete(id);
  else hidden.add(id);
  return { order: layout.order, hidden: layout.order.filter((item) => hidden.has(item)) };
}

export function defaultDashboard(): DashboardPreferences {
  return { order: [...DEFAULT_DASHBOARD.order], hidden: [...DEFAULT_DASHBOARD.hidden] };
}
