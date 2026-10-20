import "server-only";

import { cache } from "react";

import { parsePreferences, type Preferences } from "@/lib/preferences/schema";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";

/**
 * The signed-in student's preferences, with defaults for anything they have
 * not set. Shares the per-request profile query with the app layout, so it
 * costs nothing extra.
 */
export const getPreferences = cache(async (): Promise<Preferences> => {
  const { profile } = await getCurrentUserWithProfile();
  return parsePreferences(profile?.preferences ?? {});
});
