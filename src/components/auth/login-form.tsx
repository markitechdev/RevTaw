"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert, FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { TurnstileField } from "@/components/forms/turnstile-field";
import { Input } from "@/components/ui/input";
import { loginAction } from "@/lib/auth/actions";
import { IDLE_STATE } from "@/lib/forms/action-state";
import { routes } from "@/lib/routes";

export function LoginForm({
  next,
  notice,
  captchaSiteKey,
}: {
  next?: string;
  notice?: { tone: "error" | "success" | "info"; message: string } | null;
  /** Turnstile's site key while the bot check is on. */
  captchaSiteKey?: string;
}) {
  const [state, formAction] = useActionState(loginAction, IDLE_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}

      {state.status === "idle" && notice && <Alert tone={notice.tone}>{notice.message}</Alert>}
      <FormAlert state={state} />

      <Field id="email" label="Email" error={errors.email} required>
        <Input
          {...fieldA11y("email", errors.email)}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.values?.email ?? ""}
        />
      </Field>

      <Field id="password" label="Password" error={errors.password} required>
        <PasswordInput
          {...fieldA11y("password", errors.password)}
          name="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <div className="-mt-1 text-right text-sm">
        <Link href={routes.forgotPassword} className="font-medium text-primary hover:underline">
          Forgot your password?
        </Link>
      </div>

      <TurnstileField siteKey={captchaSiteKey} action="login" />

      <SubmitButton size="lg" className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}
