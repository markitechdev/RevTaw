import { NextResponse } from "next/server";
import { z } from "zod";

import { getPreferences } from "@/lib/preferences/queries";
import { getClientAddress, rateLimit } from "@/lib/rate-limit";
import { deliverDueReminders, upcomingReminders } from "@/lib/reminders/service";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({ ids: z.array(z.uuid()).max(20).optional() });

/** The signed-in student's reminders for the next hours, so the open tab can time them to the minute. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const [reminders, preferences] = await Promise.all([upcomingReminders(), getPreferences()]);
  return NextResponse.json({ reminders, browser: preferences.notifications.browser }, { headers: { "cache-control": "private, no-store" } });
}

/** Delivers the student's due reminders to the bell now and returns them (for a browser notification). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid reminders." }, { status: 400 });
  const ip = await getClientAddress();
  const limit = rateLimit(`reminders:${user.id}:${ip}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  const delivered = await deliverDueReminders({ ids: body.data.ids });
  return NextResponse.json({ delivered }, { headers: { "cache-control": "no-store" } });
}
