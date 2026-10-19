"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authErrorMessage } from "@/lib/auth/errors";
import {
  errorState,
  formString,
  successState,
  type ActionState,
} from "@/lib/forms/action-state";
import { describeRetry, getClientAddress, rateLimit } from "@/lib/rate-limit";
import { routes } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EducationLevel, StudyGoal } from "@/lib/supabase/database.types";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { changePasswordSchema, fieldErrorsFrom } from "@/lib/validation/auth";
import {
  deleteAccountSchema,
  profileDetailsSchema,
  studyPreferencesSchema,
} from "@/lib/validation/profile";

const MINUTE = 60_000;

function readPreferences(formData: FormData) {
  return {
    educationLevel: formString(formData, "educationLevel"),
    mainGoal: formString(formData, "mainGoal"),
    session: {
      sessionChoice: formString(formData, "sessionChoice"),
      customMinutes: formString(formData, "customMinutes"),
    },
  };
}

function preferenceValues(formData: FormData): Record<string, string> {
  return {
    educationLevel: formString(formData, "educationLevel"),
    mainGoal: formString(formData, "mainGoal"),
    sessionChoice: formString(formData, "sessionChoice"),
    customMinutes: formString(formData, "customMinutes"),
  };
}

async function savePreferences(
  userId: string,
  input: ReturnType<typeof readPreferences>,
  completeOnboarding: boolean,
): Promise<ActionState | null> {
  const parsed = studyPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return errorState("Please complete the highlighted choices.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
    });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      education_level: parsed.data.educationLevel as EducationLevel,
      main_goal: parsed.data.mainGoal as StudyGoal,
      preferred_session_minutes: parsed.data.session,
      ...(completeOnboarding ? { onboarding_completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", userId);

  if (error) {
    console.error("profiles: failed to save preferences", error.message);
    return errorState("We could not save your preferences. Please try again.");
  }
  return null;
}

export async function completeOnboardingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const failure = await savePreferences(user.id, readPreferences(formData), true);
  if (failure) return { ...failure, values: preferenceValues(formData) };

  redirect(`${routes.dashboard}?notice=welcome`);
}

export async function updatePreferencesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const failure = await savePreferences(user.id, readPreferences(formData), false);
  if (failure) return { ...failure, values: preferenceValues(formData) };

  revalidatePath(routes.settingsPreferences);
  revalidatePath(routes.dashboard);
  return successState("Your study preferences have been saved.");
}

export async function updateProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const values = { displayName: formString(formData, "displayName") };
  const parsed = profileDetailsSchema.safeParse(values);
  if (!parsed.success) {
    return errorState("Please fix the highlighted fields.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
      values,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", user.id);

  if (error) {
    console.error("profiles: failed to update profile", error.message);
    return errorState("We could not save your profile. Please try again.", { values });
  }

  revalidatePath("/", "layout");
  return successState("Your profile has been updated.");
}

export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !user.email) redirect(routes.login);

  const ip = await getClientAddress();
  const limit = rateLimit(`change-password:${user.id}:${ip}`, 5, 15 * MINUTE);
  if (!limit.ok) {
    return errorState(
      `Too many attempts. Please try again in ${describeRetry(limit.retryAfterSeconds)}.`,
    );
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formString(formData, "currentPassword"),
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return errorState("Please fix the highlighted fields.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
    });
  }

  const supabase = await createClient();

  // Re-authenticate with the current password before allowing the change.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) {
    return errorState("Your current password is incorrect.", {
      fieldErrors: { currentPassword: "Your current password is incorrect." },
    });
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return errorState(authErrorMessage(error));
  }

  await supabase.auth.signOut({ scope: "others" });
  return successState("Your password has been changed. Other devices have been signed out.");
}

export async function deleteAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !user.email) redirect(routes.login);

  const ip = await getClientAddress();
  const limit = rateLimit(`delete-account:${user.id}:${ip}`, 5, 15 * MINUTE);
  if (!limit.ok) {
    return errorState(
      `Too many attempts. Please try again in ${describeRetry(limit.retryAfterSeconds)}.`,
    );
  }

  const parsed = deleteAccountSchema.safeParse({
    password: formString(formData, "password"),
    confirmation: formString(formData, "confirmation").trim(),
  });
  if (!parsed.success) {
    return errorState("Please complete the confirmation.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
    });
  }

  const admin = createAdminClient();
  if (!admin) {
    return errorState(
      "Account deletion is not available on this server yet. Please contact support to delete your account.",
    );
  }

  const supabase = await createClient();
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.password,
  });
  if (reauthError) {
    return errorState("Your password is incorrect.", {
      fieldErrors: { password: "Your password is incorrect." },
    });
  }

  // Deleting the auth user cascades to the profile and, through foreign keys,
  // to every other row the student owns.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("account: failed to delete user", error.message);
    return errorState("We could not delete your account. Please try again.");
  }

  await supabase.auth.signOut();
  redirect(`${routes.login}?notice=account-deleted`);
}
