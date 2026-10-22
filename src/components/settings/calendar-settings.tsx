"use client";

import { CalendarCheck, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { disconnectCalendarAction, syncCalendarNowAction, type CalendarActionResult } from "@/lib/calendar/actions";
import type { CalendarConnectionView } from "@/lib/calendar/queries";

const NOTICE: Record<string, { tone: "success" | "error"; text: string }> = {
  connected: { tone: "success", text: "Google Calendar is connected. Your plan and exams are being added to the RevTaw Study calendar." },
  denied: { tone: "error", text: "Google Calendar was not connected: access was not allowed." },
  scope: { tone: "error", text: "Google Calendar was not connected: RevTaw needs permission to manage its own RevTaw Study calendar. Try again and leave that box ticked." },
  expired: { tone: "error", text: "That connection attempt expired. Try connecting again." },
  failed: { tone: "error", text: "Google Calendar could not be connected. Try again in a moment." },
  unavailable: { tone: "error", text: "Google Calendar is not set up on this RevTaw server yet." },
};

/** Formatted in the student's time zone with a fixed locale, so the server and the browser render the same text. */
function when(value: string | null, timeZone: string): string {
  if (!value) return "not yet";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone });
}

/**
 * Google Calendar (research doc §16): a separate opt-in that copies the
 * planner to a "RevTaw Study" calendar. RevTaw can touch only that calendar.
 */
export function CalendarSettings({ configured, connection, notice, timeZone }: { configured: boolean; connection: CalendarConnectionView | null; notice: string | null; timeZone: string }) {
  const [result, setResult] = useState<CalendarActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const banner = notice ? NOTICE[notice] : null;
  const run = (action: () => Promise<CalendarActionResult>) => {
    setResult(null);
    startTransition(async () => setResult(await action()));
  };

  if (!configured) {
    return <p className="text-sm text-muted-foreground">Google Calendar is not set up on this RevTaw server yet. Planner reminders in RevTaw still work.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {banner && !result && <Alert tone={banner.tone}>{banner.text}</Alert>}
      {result && <Alert tone={result.ok ? "success" : "error"}>{result.message}</Alert>}

      {!connection ? (
        <>
          <p className="text-sm text-muted-foreground">
            Add your study plan, planner activities and exams to a <strong className="font-semibold text-foreground">RevTaw Study</strong> calendar in Google Calendar, with a phone notification for each reminder. RevTaw can only manage that one calendar: it cannot see or change your other calendars, and it never asks for your Google password.
          </p>
          <div>
            <a href="/api/calendar/google/connect" className={buttonClasses()}>
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
              Connect Google Calendar
            </a>
          </div>
        </>
      ) : (
        <>
          <dl className="grid gap-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Status:</dt>
              <dd className="font-medium text-foreground">{connection.status === "connected" ? "Connected" : connection.status === "needs_reconnect" ? "Needs reconnecting" : "Connected, last sync failed"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Last synced:</dt>
              <dd className="text-foreground">{when(connection.lastSyncedAt, timeZone)}</dd>
            </div>
          </dl>
          {connection.lastError && <Alert tone="error">{connection.lastError}</Alert>}
          <p className="text-xs text-muted-foreground">Changes in the planner reach Google Calendar a moment after you make them. Edits made in Google Calendar are not copied back.</p>
          <div className="flex flex-wrap items-center gap-3">
            {connection.status === "needs_reconnect" ? (
              <a href="/api/calendar/google/connect" className={buttonClasses()}>
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                Reconnect Google Calendar
              </a>
            ) : (
              <Button type="button" variant="secondary" loading={pending} onClick={() => run(syncCalendarNowAction)}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Sync now
              </Button>
            )}
            <Button type="button" variant="ghost" disabled={pending} onClick={() => run(disconnectCalendarAction)}>
              Disconnect
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
