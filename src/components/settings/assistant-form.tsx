"use client";

import { useOptimistic, useState, useTransition } from "react";

import { useModifierLabel } from "@/components/app/command-menu";
import { Alert } from "@/components/forms/form-alert";
import { Switch } from "@/components/ui/switch";
import { saveAssistantPreferencesAction } from "@/lib/preferences/actions";
import type { AssistantPreferences } from "@/lib/preferences/schema";

/** Ask RevTaw (UI phase §16, §35): whether its floating button shows on every page. Saves on toggle. */
export function AssistantPreferencesForm({ initial }: { initial: AssistantPreferences }) {
  const [saved, setSaved] = useState(initial);
  const [shown, setShown] = useOptimistic(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const modifier = useModifierLabel();

  const save = (next: AssistantPreferences) => {
    setError(null);
    startTransition(async () => {
      setShown(next);
      const result = await saveAssistantPreferencesAction(next);
      if (result.ok) setSaved(next);
      else setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Switch
        checked={shown.launcher}
        onChange={(launcher) => save({ ...shown, launcher })}
        label="Show the Ask RevTaw button"
        description={`The round button at the bottom right of every page. Turned off, Ask RevTaw still opens from ${modifier}+K and from the "Ask RevTaw why" buttons.`}
      />
      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {pending ? "Saving…" : "Saved to your account."}
      </p>
    </div>
  );
}
