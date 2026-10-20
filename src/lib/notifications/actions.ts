"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { markNotificationsRead } from "@/lib/notifications/service";
import { routes } from "@/lib/routes";
import { getCurrentUser } from "@/lib/supabase/server";

export type NotificationActionResult = { ok: true } | { ok: false; message: string };

export async function markNotificationsReadAction(ids: string[] | "all"): Promise<NotificationActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const parsed = z.union([z.literal("all"), z.array(z.uuid()).min(1).max(100)]).safeParse(ids);
  if (!parsed.success) return { ok: false, message: "Invalid notifications." };
  try {
    await markNotificationsRead(parsed.data);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("notifications: mark read failed", error);
    return { ok: false, message: "Notifications could not be updated." };
  }
}
