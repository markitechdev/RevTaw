import "server-only";

import { getPreferences } from "@/lib/preferences/queries";
import type { NotificationKind } from "@/lib/supabase/database.types";

/**
 * Settings → Notifications: whether an in-app notification of this kind should
 * be created for the signed-in student. Level-ups follow the badges switch.
 */
export async function inAppAllowed(kind: NotificationKind): Promise<boolean> {
  const { notifications } = await getPreferences();
  const key = kind === "level_up" ? "achievement" : kind;
  return notifications.inApp && !notifications.muted.includes(key);
}
