"use server";

import { redirect } from "next/navigation";

import { authErrorMessage } from "@/lib/auth/errors";
import { clearPendingEmail, getPendingEmail, setPendingEmail } from "@/lib/auth/pending-email";
import { getRecoveryState } from "@/lib/auth/recovery";
import { getSiteUrl } from "@/lib/env";
import {
  errorState,
  formString,
  successState,
  type ActionState,
} from "@/lib/forms/action-state";
import { describeRetry, getClientAddress, rateLimit } from "@/lib/rate-limit";
import { routes, safeNextPath } from "@/lib/routes";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { createAuthClient } from "@/lib/supabase/auth-client";
import { createClient } from "@/lib/supabase/server";
import {
  emailSchema,
  fieldErrorsFrom,
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  registerSchema,
} from "@/lib/validation/auth";

const MINUTE = 60_000;

function callbackUrl(next: string): string {
  return `${getSiteUrl()}${routes.authCallback}?next=${encodeURIComponent(next)}`;
}

function tooManyAttempts(retryAfterSeconds: number, what: string): string {
  return `Too many ${what}. Please try again in ${describeRetry(retryAfterSeconds)}.`;
}

/** For whoever runs RevTaw: an email Supabase did not send (its email limits, or an error). Never the address. */
function logUnsentEmail(kind: "reset" | "verification", error: { code?: string; status?: number }): void {
  console.warn(`auth: ${kind} email not sent (${error.code ?? error.status ?? "error"})`);
}

export async function registerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = {
    displayName: formString(formData, "displayName"),
    email: formString(formData, "email"),
  };

  // Generous per-IP limit: whole classrooms often share one address.
  const ip = await getClientAddress();
  const limit = await rateLimit(`register:${ip}`, 20, 15 * MINUTE);
  if (!limit.ok) {
    return errorState(tooManyAttempts(limit.retryAfterSeconds, "sign-up attempts"), { values });
  }

  const parsed = registerSchema.safeParse({
    ...values,
    password: formString(formData, "password"),
  });
  if (!parsed.success) {
    return errorState("Please fix the highlighted fields.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
      values,
    });
  }

  const captcha = await verifyTurnstile(formData, "register");
  if (!captcha.ok) {
    return errorState(captcha.message, { values });
  }

  const { displayName, email, password } = parsed.data;
  const auth = await createAuthClient();
  const { data, error } = await auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: callbackUrl(`${routes.onboarding}?verified=1`),
    },
  });

  if (error) {
    return errorState(authErrorMessage(error), { values });
  }

  if (data.session) {
    // Email confirmation is disabled on this Supabase project.
    redirect(routes.onboarding);
  }

  // Either a new account or an existing one: both get the same screen so the
  // form cannot be used to check whether an email address is registered.
  await setPendingEmail(email);
  redirect(routes.verifyEmail);
}

export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = { email: formString(formData, "email") };
  const next = safeNextPath(formString(formData, "next"));

  const ip = await getClientAddress();
  const ipLimit = await rateLimit(`login:ip:${ip}`, 20, 15 * MINUTE);
  if (!ipLimit.ok) {
    return errorState(tooManyAttempts(ipLimit.retryAfterSeconds, "sign-in attempts"), { values });
  }

  const parsed = loginSchema.safeParse({
    email: values.email,
    password: formString(formData, "password"),
  });
  if (!parsed.success) {
    return errorState("Please fix the highlighted fields.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
      values,
    });
  }

  // Before the per-account limit: a request without a passing check never tried the password.
  const captcha = await verifyTurnstile(formData, "login");
  if (!captcha.ok) {
    return errorState(captcha.message, { values });
  }

  const { email, password } = parsed.data;
  const accountLimit = await rateLimit(`login:email:${email}`, 8, 15 * MINUTE);
  if (!accountLimit.ok) {
    return errorState(
      tooManyAttempts(accountLimit.retryAfterSeconds, "sign-in attempts for this account"),
      { values },
    );
  }

  const auth = await createAuthClient();
  const { error } = await auth.signInWithPassword({ email, password });

  if (error?.code === "email_not_confirmed") {
    await setPendingEmail(email);
    redirect(`${routes.verifyEmail}?reason=unconfirmed`);
  }

  if (error) {
    return errorState(authErrorMessage(error), { values });
  }

  await clearPendingEmail();
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(routes.home);
}

export async function forgotPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = { email: formString(formData, "email") };

  const ip = await getClientAddress();
  const limit = await rateLimit(`forgot:${ip}`, 10, 15 * MINUTE);
  if (!limit.ok) {
    return errorState(tooManyAttempts(limit.retryAfterSeconds, "reset requests"), { values });
  }

  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return errorState("Please fix the highlighted fields.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
      values,
    });
  }

  const captcha = await verifyTurnstile(formData, "forgot");
  if (!captcha.ok) {
    return errorState(captcha.message, { values });
  }

  const { email } = parsed.data;
  // Counted for every address alike, registered or not, so it reveals nothing; it stops one address being flooded.
  const perEmail = await rateLimit(`forgot:email:${email}`, 3, 60 * MINUTE);
  if (!perEmail.ok) {
    return errorState(
      `We have sent several reset links to this address recently. Check your inbox and spam folder, or try again in ${describeRetry(perEmail.retryAfterSeconds)}.`,
      { values },
    );
  }

  const auth = await createAuthClient();
  const { error } = await auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl(routes.resetPassword),
  });
  // Every outcome gets the same answer: Supabase limits emails per registered
  // account, so passing its "too many" on would reveal that the address has one.
  if (error) logUnsentEmail("reset", error);

  return successState(
    "If an account exists for that address, we have sent a link to reset the password. The link expires in one hour.",
  );
}

export async function resetPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Only a session opened from a reset link minutes ago may skip the current password.
  const { user, fresh } = await getRecoveryState();
  if (!user || !fresh) {
    redirect(`${routes.forgotPassword}?error=expired`);
  }

  const parsed = newPasswordSchema.safeParse({
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return errorState("Please fix the highlighted fields.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
    });
  }

  const auth = await createAuthClient();
  const { error } = await auth.updateUser({ password: parsed.data.password });
  if (error) {
    return errorState(authErrorMessage(error));
  }

  // Invalidate every other session that may have been using the old password.
  await auth.signOut({ scope: "others" });

  redirect(`${routes.dashboard}?notice=password-updated`);
}

export async function resendVerificationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = await getClientAddress();
  const limit = await rateLimit(`resend:${ip}`, 6, 60 * MINUTE);
  if (!limit.ok) {
    return errorState(tooManyAttempts(limit.retryAfterSeconds, "requests"));
  }

  const submitted = formString(formData, "email");
  const candidate = submitted || (await getPendingEmail()) || "";
  const parsed = emailSchema.safeParse(candidate);
  if (!parsed.success) {
    return errorState("Enter the email address you registered with.", {
      fieldErrors: { email: parsed.error.issues[0]?.message ?? "Enter a valid email address." },
    });
  }

  // Before the once-a-minute limit, which should count only emails actually requested.
  const captcha = await verifyTurnstile(formData, "resend");
  if (!captcha.ok) {
    return errorState(captcha.message);
  }

  const email = parsed.data;
  const perEmail = await rateLimit(`resend:email:${email}`, 1, MINUTE);
  if (!perEmail.ok) {
    return errorState("We just sent an email to that address. Please wait a minute before trying again.");
  }

  const auth = await createAuthClient();
  const { error } = await auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl(`${routes.onboarding}?verified=1`) },
  });

  // As with reset links: the same answer whatever Supabase says, so the form reveals nothing.
  if (error) logUnsentEmail("verification", error);

  await setPendingEmail(email);
  return successState(`If ${email} is registered and not yet verified, a new link is on its way.`);
}
