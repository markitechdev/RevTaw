"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { saveDashboardAction } from "@/lib/preferences/actions";
import { defaultDashboard, moveWidget, toggleWidget, widgetGroup, type WidgetGroup } from "@/lib/preferences/dashboard-layout";
import { WIDGET_BY_ID, type DashboardPreferences } from "@/lib/preferences/options";
import { cn } from "@/lib/utils";

const GROUPS: ReadonlyArray<{ id: WidgetGroup; label: string; description: string }> = [
  { id: "focus", label: "Main", description: "The top of your dashboard. The first one shows large." },
  { id: "numbers", label: "At a glance", description: "Small numbers, side by side in one strip." },
  { id: "lists", label: "Lists", description: "Short lists at the bottom." },
];

/**
 * Show, hide and reorder dashboard widgets (UI phase §8). Every change is
 * applied at once and saved to the account; reordering uses buttons so it
 * works with a keyboard and a screen reader, not only by dragging.
 */
export function DashboardCustomizer({ layout, onChange, status }: { layout: DashboardPreferences; onChange: (next: DashboardPreferences) => void; status?: string | null }) {
  const [announcement, setAnnouncement] = useState("");

  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((group) => {
        const ids = layout.order.filter((id) => widgetGroup(id) === group.id);
        return (
          <section key={group.id} aria-labelledby={`widgets-${group.id}`} className="flex flex-col gap-2">
            <div>
              <h3 id={`widgets-${group.id}`} className="text-sm font-semibold text-foreground">
                {group.label}
              </h3>
              <p className="text-xs text-muted-foreground">{group.description}</p>
            </div>
            <ol className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {ids.map((id, index) => {
                const widget = WIDGET_BY_ID[id];
                const visible = !layout.hidden.includes(id);
                return (
                  <li key={id} className={cn("flex items-start gap-2 px-3 py-3", !visible && "bg-muted/40")}>
                    <Switch
                      className="min-w-0 flex-1"
                      checked={visible}
                      label={widget.label}
                      description={widget.description}
                      onChange={(next) => {
                        onChange(toggleWidget(layout, id, next));
                        setAnnouncement(`${widget.label} ${next ? "shown" : "hidden"}.`);
                      }}
                    />
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Move ${widget.label} up`}
                        disabled={index === 0}
                        onClick={() => {
                          onChange(moveWidget(layout, id, -1));
                          setAnnouncement(`${widget.label} moved up, now ${index} of ${ids.length}.`);
                        }}
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Move ${widget.label} down`}
                        disabled={index === ids.length - 1}
                        onClick={() => {
                          onChange(moveWidget(layout, id, 1));
                          setAnnouncement(`${widget.label} moved down, now ${index + 2} of ${ids.length}.`);
                        }}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement} {status ?? ""}
      </p>
    </div>
  );
}

/** The customizer as a settings form: applies and saves each change itself. */
export function DashboardCustomizerForm({ layout }: { layout: DashboardPreferences }) {
  const [optimistic, setOptimistic] = useOptimistic(layout);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const change = (next: DashboardPreferences) => {
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const result = await saveDashboardAction(next);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert tone="error">{error}</Alert>}
      <DashboardCustomizer layout={optimistic} onChange={change} status={pending ? "Saving…" : null} />
      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => change(defaultDashboard())}>
          Reset to default
        </Button>
        <span className="text-xs text-muted-foreground" aria-hidden="true">
          {pending ? "Saving…" : "Changes save automatically."}
        </span>
      </div>
    </div>
  );
}
