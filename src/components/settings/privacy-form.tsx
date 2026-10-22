"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Switch } from "@/components/ui/switch";
import { savePrivacyPreferencesAction, type SavePreferencesResult } from "@/lib/preferences/actions";
import type { PrivacyPreferences } from "@/lib/preferences/schema";

/** Usage analytics: off unless the student turns it on; saved as soon as it changes. */
export function PrivacyForm({ initial, available }: { initial: PrivacyPreferences; available: boolean }) {
  const [analytics, setAnalytics] = useState(initial.analytics && available);
  const [result, setResult] = useState<SavePreferencesResult | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    setAnalytics(next);
    setResult(null);
    startTransition(async () => {
      const saved = await savePrivacyPreferencesAction({ analytics: next });
      if (!saved.ok) setAnalytics(!next);
      setResult(saved);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Switch
        checked={analytics}
        onChange={toggle}
        disabled={!available}
        label="Share anonymous usage data"
        description={
          available
            ? "Helps improve RevTaw: which features you use (for example, that a quiz was made or Tamari answered), never your materials, questions, answers or messages. Sent to PostHog's EU servers under a code instead of your name or email, with no location or tracking cookies."
            : "This RevTaw server does not collect usage data."
        }
      />
      {result && !result.ok && <Alert tone="error">{result.error}</Alert>}
      {result?.ok && <p className="text-xs text-muted-foreground" role="status">{analytics ? "Thanks! Anonymous usage data is on." : "Usage data is off."}</p>}
    </div>
  );
}
