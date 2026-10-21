"use client";

import { LayoutGrid, SlidersHorizontal } from "lucide-react";
import { useOptimistic, useState, useTransition, type ReactNode } from "react";

import { DashboardCustomizer } from "@/components/dashboard/customizer";
import { WidgetSkeleton } from "@/components/dashboard/widget-shell";
import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { saveDashboardAction } from "@/lib/preferences/actions";
import { defaultDashboard, widgetGroup } from "@/lib/preferences/dashboard-layout";
import { WIDGET_BY_ID, type DashboardPreferences, type WidgetId } from "@/lib/preferences/schema";
import { cn } from "@/lib/utils";

const STAT_COLUMNS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4"] as const;

function skeletonFor(id: WidgetId) {
  const widget = WIDGET_BY_ID[id];
  if (widget.zone === "focus") return <WidgetSkeleton variant={id === "continue" ? "hero" : "panel"} />;
  return <WidgetSkeleton variant={widget.wide ? "list" : "tile"} />;
}

/**
 * The home dashboard's layout (UI phase §5–§8): the student's widgets in their
 * order, and the Customize panel. Widgets are server-rendered and streamed in;
 * this component only arranges them, so showing, hiding and reordering feel
 * instant while the change is saved to the account.
 */
export function DashboardBoard({ layout, header, stage, widgets }: { layout: DashboardPreferences; header: ReactNode; stage?: ReactNode; widgets: Partial<Record<WidgetId, ReactNode>> }) {
  const [optimistic, setOptimistic] = useOptimistic(layout);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (next: DashboardPreferences) => {
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const result = await saveDashboardAction(next);
      if (!result.ok) setError(result.error);
    });
  };

  const visible = optimistic.order.filter((id) => !optimistic.hidden.includes(id));
  const focus = visible.filter((id) => widgetGroup(id) === "focus");
  const stats = visible.filter((id) => widgetGroup(id) === "numbers");
  const lists = visible.filter((id) => widgetGroup(id) === "lists");
  const node = (id: WidgetId) => widgets[id] ?? skeletonFor(id);

  return (
    <div className="flex flex-col gap-6">
      {/*
        The greeting, with Tamari beside it (sitting on the first card's edge) and the Customize
        button in the corner: greeting | Customize, then Tamari on its own row on narrower screens;
        greeting | Tamari | Customize in one row on wide ones.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:gap-x-8">
        <div className="min-w-0 xl:self-end">{header}</div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label="Customize dashboard"
          title="Customize dashboard"
          className="col-start-2 row-start-1 -mr-2 xl:col-start-3"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Customize</span>
        </Button>
        {stage && <div className="col-span-2 min-w-0 xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:self-end">{stage}</div>}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-8">
          <LayoutGrid className="h-6 w-6 text-primary" aria-hidden="true" />
          <p className="font-display text-lg font-semibold">Your dashboard is empty.</p>
          <p className="text-sm text-muted-foreground">Every widget is hidden. Turn a few back on, or start over with the default layout.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              Choose widgets
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => change(defaultDashboard())}>
              Reset to default
            </Button>
          </div>
        </div>
      ) : (
        <>
          {focus.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {focus.map((id, index) => (
                <div key={id} className={cn("min-w-0", (index === 0 || (index === focus.length - 1 && (focus.length - 1) % 2 === 1)) && "lg:col-span-2")}>
                  {node(id)}
                </div>
              ))}
            </div>
          )}

          {(stats.length > 0 || lists.length > 0) && (
            <section aria-label="At a glance" className="flex flex-col gap-4">
              {stats.length > 0 && (
                <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border", STAT_COLUMNS[Math.min(stats.length, 4)])}>
                  {stats.map((id, index) => (
                    <div key={id} className={cn("min-w-0", index === stats.length - 1 && stats.length % 2 === 1 && "col-span-2 lg:col-span-1")}>
                      {node(id)}
                    </div>
                  ))}
                </div>
              )}
              {lists.length > 0 && (
                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                  {lists.map((id, index) => (
                    <div key={id} className={cn("min-w-0", index === lists.length - 1 && lists.length % 2 === 1 && "lg:col-span-2")}>
                      {node(id)}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Customize your dashboard"
        description="Show what helps you, hide what doesn't. Saved to your account."
        footer={
          <>
            <span className="mr-auto text-xs text-muted-foreground" aria-hidden="true">
              {pending ? "Saving…" : "Changes save automatically."}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => change(defaultDashboard())}>
              Reset to default
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}
        <DashboardCustomizer layout={optimistic} onChange={change} status={pending ? "Saving…" : null} />
      </Sheet>
    </div>
  );
}
