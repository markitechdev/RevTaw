import "server-only";

import { createClient } from "@/lib/supabase/server";

export type CalendarConnectionView = {
  status: "connected" | "needs_reconnect" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
  connectedAt: string;
};

/** The signed-in student's Google Calendar connection, without the token (it is not granted to students). */
export async function getCalendarConnection(): Promise<CalendarConnectionView | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("calendar_connections").select("status, last_synced_at, last_error, connected_at").maybeSingle();
  if (!data) return null;
  return { status: data.status, lastSyncedAt: data.last_synced_at, lastError: data.last_error, connectedAt: data.connected_at };
}
