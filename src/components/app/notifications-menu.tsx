"use client";

import { Award, Bell, CalendarClock, CheckCheck, Flag, Flame, Layers, TrendingUp, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { formatRelativeDate } from "@/components/materials/material-card";
import { markNotificationsReadAction } from "@/lib/notifications/actions";
import type { Notification, NotificationKind } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationKind, typeof Bell> = {
  review_due: Layers,
  exam_upcoming: CalendarClock,
  plan_reminder: CalendarClock,
  plan_adjusted: Wand2,
  daily_goal: Flag,
  streak: Flame,
  achievement: Award,
  level_up: TrendingUp,
};

/** Bell + panel for the internal reminder feed (§35). Rows come from the server; reading marks them. */
export function NotificationsMenu({ notifications, unread, align = "left" }: { notifications: Notification[]; unread: number; align?: "left" | "right" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAll = () =>
    startTransition(async () => {
      await markNotificationsReadAction("all");
      router.refresh();
    });

  return (
    <div className="relative" ref={panel}>
      <Button type="button" variant="ghost" size="icon" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((state) => !state)} className="relative h-9 w-9">
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <div role="dialog" aria-label="Notifications" className={cn("absolute top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-2 shadow-xl", align === "left" ? "left-0" : "right-0")}>
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <Button type="button" size="sm" variant="ghost" loading={pending} onClick={markAll}>
                {!pending && <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                Mark all read
              </Button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No reminders yet. Reviews due, exam countdowns and plan tasks appear here.</p>
          ) : (
            <ul className="flex max-h-80 flex-col overflow-y-auto">
              {notifications.map((item) => {
                const Icon = ICONS[item.kind] ?? Bell;
                const body = (
                  <>
                    <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", item.read_at ? "bg-muted text-muted-foreground" : "bg-primary-soft text-primary")}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-sm", !item.read_at && "font-medium")}>{item.title}</span>
                      {item.body && <span className="block text-xs text-muted-foreground">{item.body}</span>}
                      <span className="block text-[11px] text-muted-foreground" suppressHydrationWarning>
                        {formatRelativeDate(item.created_at)}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link href={item.href} onClick={() => setOpen(false)} className="flex gap-2 rounded-lg px-2 py-2 hover:bg-muted">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex gap-2 rounded-lg px-2 py-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
