"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { REMINDERS_CHANGED_EVENT } from "@/components/planner/reminder-events";

type Upcoming = { id: string; remindAt: string };
type Delivered = { id: string; title: string; body: string; href: string };

const REFRESH_MS = 10 * 60_000;
/** Timers further out than this are set on a later refresh. */
const HORIZON_MS = 6 * 60 * 60_000;

/**
 * While RevTaw is open, planner reminders arrive at their minute (UI phase
 * §29): the tab times the next few hours of reminders, asks the server to
 * put each in the bell when it is due and, when the student turned browser
 * notifications on and allowed them, shows a system notification too. When
 * RevTaw is closed the scheduler (or the next visit) delivers them instead.
 */
export function ReminderWatcher() {
  const router = useRouter();

  useEffect(() => {
    let timers: number[] = [];
    let browser = false;
    let stopped = false;

    const deliver = async (ids: string[]) => {
      try {
        const response = await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ ids }) });
        if (!response.ok || stopped) return;
        const { delivered = [] } = (await response.json()) as { delivered?: Delivered[] };
        if (delivered.length === 0) return;
        router.refresh();
        if (browser && "Notification" in window && Notification.permission === "granted") {
          for (const item of delivered) {
            const notification = new Notification(item.title, { body: item.body, tag: `revtaw-reminder-${item.id}` });
            notification.onclick = () => {
              window.focus();
              router.push(item.href);
              notification.close();
            };
          }
        }
      } catch {
        // Offline: the next refresh or the scheduler delivers it.
      }
    };

    const schedule = async () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
      try {
        const response = await fetch("/api/reminders", { headers: { accept: "application/json" } });
        if (!response.ok || stopped) return;
        const body = (await response.json()) as { reminders?: Upcoming[]; browser?: boolean };
        browser = Boolean(body.browser);
        const now = Date.now();
        const due: string[] = [];
        for (const reminder of body.reminders ?? []) {
          const delay = new Date(reminder.remindAt).getTime() - now;
          if (delay <= 1_000) due.push(reminder.id);
          else if (delay < HORIZON_MS) timers.push(window.setTimeout(() => void deliver([reminder.id]), delay));
        }
        if (due.length > 0) void deliver(due);
      } catch {
        // Try again on the next refresh.
      }
    };

    void schedule();
    const interval = window.setInterval(() => void schedule(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void schedule();
    };
    const onChanged = () => void schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(REMINDERS_CHANGED_EVENT, onChanged);
    return () => {
      stopped = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(REMINDERS_CHANGED_EVENT, onChanged);
    };
  }, [router]);

  return null;
}
