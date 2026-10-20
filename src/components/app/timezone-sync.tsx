"use client";

import { useEffect } from "react";

import { setTimezoneAction } from "@/lib/planner/actions";

/**
 * Stores the browser's IANA time zone on the profile once, so "today" in the
 * planner and the streak follow the student's calendar rather than UTC.
 */
export function TimezoneSync({ current }: { current: string | null }) {
  useEffect(() => {
    let zone: string | null = null;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      zone = null;
    }
    if (!zone || zone === current) return;
    if (current) return; // A zone chosen in settings wins over auto-detection.
    void setTimezoneAction(zone);
  }, [current]);
  return null;
}
