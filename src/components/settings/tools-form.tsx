"use client";

import { Lock } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

import { HOME_ITEM, NAV_GROUPS, TOOLS } from "@/components/app/nav-items";
import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { saveToolsAction } from "@/lib/preferences/actions";
import { DEFAULT_PINNED_TOOLS, TOOL_IDS, type ToolId } from "@/lib/preferences/schema";

/**
 * My RevTaw Tools (UI phase §9): choose which tools sit in the navigation.
 * Unpinned tools are never gone — they stay one click away under More Tools
 * and in the command menu.
 */
export function ToolsForm({ pinned }: { pinned: ToolId[] }) {
  const [optimistic, setOptimistic] = useOptimistic(pinned);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = (next: ToolId[]) => {
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const result = await saveToolsAction({ pinned: next });
      if (!result.ok) setError(result.error);
    });
  };
  const toggle = (id: ToolId, on: boolean) => save(TOOL_IDS.filter((tool) => (tool === id ? on : optimistic.includes(tool))));

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert tone="error">{error}</Alert>}
      {NAV_GROUPS.map((group) => {
        const tools = TOOL_IDS.filter((id) => TOOLS[id].group === group.id);
        return (
          <section key={group.id} aria-labelledby={`tools-${group.id}`} className="flex flex-col gap-2">
            <h3 id={`tools-${group.id}`} className="text-sm font-semibold text-foreground">
              {group.label}
            </h3>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {group.id === "main" && (
                <li className="flex items-start gap-3 px-3 py-3">
                  <HOME_ITEM.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{HOME_ITEM.label}</p>
                      <p className="text-xs text-muted-foreground">{HOME_ITEM.description}</p>
                    </div>
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      Always shown
                    </span>
                  </div>
                </li>
              )}
              {tools.map((id) => {
                const tool = TOOLS[id];
                const Icon = tool.icon;
                return (
                  <li key={id} className="flex items-start gap-3 px-3 py-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <Switch className="min-w-0 flex-1" checked={optimistic.includes(id)} onChange={(on) => toggle(id, on)} label={tool.label} description={tool.description} />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => save([...DEFAULT_PINNED_TOOLS])}>
          Reset to default
        </Button>
        <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {pending ? "Saving…" : "Changes save automatically. Tools you turn off stay under More Tools."}
        </span>
      </div>
    </div>
  );
}
