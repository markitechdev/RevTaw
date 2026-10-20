import "server-only";

import { cache } from "react";

import type { Profile } from "@/lib/supabase/database.types";
import { createClient, getCurrentUser, type CurrentUser } from "@/lib/supabase/server";

export type ProfileSelection = Pick<
  Profile,
  | "id"
  | "display_name"
  | "education_level"
  | "main_goal"
  | "preferred_session_minutes"
  | "onboarding_completed_at"
  | "timezone"
  | "preferences"
>;

const PROFILE_COLUMNS =
  "id, display_name, education_level, main_goal, preferred_session_minutes, onboarding_completed_at, timezone, preferences";

/**
 * Loads the signed-in student's profile, creating the row if the sign-up
 * trigger did not (for example when the account predates the migration).
 * Memoised per request so layouts and pages share one query.
 */
export const getProfileForUser = cache(
  async (user: CurrentUser): Promise<ProfileSelection | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("profiles: failed to load profile", error.message);
      return null;
    }
    if (data) return data;

    const fallbackName = user.email?.split("@")[0] ?? "";
    const { data: created, error: insertError } = await supabase
      .from("profiles")
      .insert({ id: user.id, display_name: fallbackName.slice(0, 80) })
      .select(PROFILE_COLUMNS)
      .single();

    if (insertError) {
      console.error("profiles: failed to create missing profile", insertError.message);
      return null;
    }
    return created;
  },
);

/** Convenience for pages: current user plus their profile (or nulls). */
export const getCurrentUserWithProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return { user: null, profile: null };
  const profile = await getProfileForUser(user);
  return { user, profile };
});
