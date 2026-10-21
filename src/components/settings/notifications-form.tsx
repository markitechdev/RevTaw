"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { saveNotificationPreferencesAction, type SavePreferencesResult } from "@/lib/preferences/actions";
import { MUTABLE_NOTIFICATION_KINDS, REMINDER_OFFSETS, type NotificationPreferences, type ReminderOffset } from "@/lib/preferences/schema";
import type { NotificationKind } from "@/lib/supabase/database.types";

type BrowserPermission = "default" | "granted" | "denied" | "unsupported";

function currentPermission(): BrowserPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Notifications (UI phase §29, §35): where reminders reach the student — the
 * bell, email, the browser — the default reminder for new planner activities,
 * and which kinds of in-app notifications to get.
 */
export function NotificationsForm({ initial, emailAvailable }: { initial: NotificationPreferences; emailAvailable: boolean }) {
  const [inApp, setInApp] = useState(initial.inApp);
  const [email, setEmail] = useState(initial.email && emailAvailable);
  const [browser, setBrowser] = useState(initial.browser);
  const [defaultReminder, setDefaultReminder] = useState<ReminderOffset>(initial.defaultReminder);
  const [enabledKinds, setEnabledKinds] = useState<NotificationKind[]>(MUTABLE_NOTIFICATION_KINDS.map((kind) => kind.id).filter((id) => !initial.muted.includes(id)));
  const [browserNote, setBrowserNote] = useState<string | null>(null);
  const [result, setResult] = useState<SavePreferencesResult | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleBrowser = async (next: boolean) => {
    setBrowserNote(null);
    if (!next) {
      setBrowser(false);
      return;
    }
    const permission = currentPermission();
    if (permission === "unsupported") {
      setBrowserNote("This browser does not support notifications.");
      return;
    }
    const answer = permission === "default" ? await Notification.requestPermission() : permission;
    if (answer === "granted") setBrowser(true);
    else setBrowserNote("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
  };

  const submit = () => {
    setResult(null);
    startTransition(async () => {
      const muted = MUTABLE_NOTIFICATION_KINDS.map((kind) => kind.id).filter((id) => !enabledKinds.includes(id));
      setResult(await saveNotificationPreferencesAction({ inApp, email: email && emailAvailable, browser, defaultReminder, muted }));
    });
  };

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {result && !result.ok && <Alert tone="error">{result.error}</Alert>}
      {result?.ok && <Alert tone="success">Your notification settings are saved.</Alert>}

      <section aria-labelledby="notify-channels" className="flex flex-col gap-4">
        <h3 id="notify-channels" className="text-sm font-semibold text-foreground">
          Where reminders reach you
        </h3>
        <Switch checked={inApp} onChange={setInApp} label="In RevTaw" description="The bell at the top of the menu: reviews due, exams coming up, today's plan, goals and badges." />
        <Switch
          checked={email}
          onChange={setEmail}
          disabled={!emailAvailable}
          label="Email"
          description={emailAvailable ? "Planner reminders by email at the time you choose for each activity." : "Email reminders are not set up on this RevTaw server yet. In-app reminders still work."}
        />
        <Switch checked={browser} onChange={(next) => void toggleBrowser(next)} label="Browser notifications" description="A pop-up from your browser when a planner reminder is due while RevTaw is open." />
        {browserNote && (
          <p className="text-xs text-warning" role="status">
            {browserNote}
          </p>
        )}
      </section>

      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="default-reminder">Default reminder for new planner activities</Label>
        <Select id="default-reminder" value={defaultReminder} onChange={(event) => setDefaultReminder(event.target.value as ReminderOffset)}>
          {REMINDER_OFFSETS.map((offset) => (
            <option key={offset.id} value={offset.id}>
              {offset.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">You can change it for each activity when you add it.</p>
      </div>

      <ChipGroup
        type="multiple"
        name="kinds"
        legend="What RevTaw tells you about"
        description="Turn off what you do not need. Muted kinds are not added to the bell."
        value={enabledKinds}
        onChange={setEnabledKinds}
        options={MUTABLE_NOTIFICATION_KINDS.map((kind) => ({ value: kind.id, label: kind.label, hint: kind.hint, disabled: !inApp }))}
        look="card"
      />

      <div className="flex items-center gap-3 border-t border-border pt-5">
        <Button type="submit" loading={pending}>
          Save notification settings
        </Button>
      </div>
    </form>
  );
}
