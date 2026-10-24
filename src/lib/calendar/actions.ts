"use server";

import { revalidatePath } from "next/cache";

import { calendarConfigured } from "@/lib/calendar/google";
import { reconcileCalendar, revokeCalendarGrant } from "@/lib/calendar/sync";
import { rateLimit } from "@/lib/rate-limit";
import { routes } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

export type CalendarActionResult = { ok: true; message: string } | { ok: false; message: string };

/** Settings → Google Calendar → Sync now. */
export async function syncCalendarNowAction(): Promise<CalendarActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  if (!calendarConfigured()) return { ok: false, message: "Google Calendar is not set up on this server." };
  const limit = await rateLimit(`calendar-sync:${user.id}`, 10, 10 * 60_000);
  if (!limit.ok) return { ok: false, message: "RevTaw just synced. Try again in a few minutes." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Google Calendar is not set up on this server." };
  try {
    const outcome = await reconcileCalendar(admin, user.id);
    revalidatePath(routes.settingsNotifications);
    if (!outcome) return { ok: false, message: "Connect Google Calendar first." };
    const changes = outcome.written + outcome.removed;
    return { ok: true, message: changes === 0 ? "Your RevTaw Study calendar is up to date." : `Synced: ${outcome.written} added or updated, ${outcome.removed} removed.` };
  } catch {
    revalidatePath(routes.settingsNotifications);
    return { ok: false, message: "RevTaw couldn't sync with Google Calendar. Check the status below." };
  }
}

/** Settings → Google Calendar → Disconnect: revokes RevTaw's access at Google and forgets the token. */
export async function disconnectCalendarAction(): Promise<CalendarActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Google Calendar is not set up on this server." };
  const removed = await revokeCalendarGrant(admin, user.id);
  revalidatePath(routes.settingsNotifications);
  if (!removed) return { ok: false, message: "RevTaw couldn't disconnect Google Calendar. Try again." };
  return { ok: true, message: "Google Calendar is disconnected. The RevTaw Study calendar stays in your Google account until you delete it there." };
}
