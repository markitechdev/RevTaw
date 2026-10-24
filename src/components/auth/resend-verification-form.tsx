"use client";

import { useActionState } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { TurnstileField } from "@/components/forms/turnstile-field";
import { Input } from "@/components/ui/input";
import { resendVerificationAction } from "@/lib/auth/actions";
import { IDLE_STATE } from "@/lib/forms/action-state";

/**
 * Lets a student request another verification email. When the address is
 * already known (from the registration just completed) only a button is shown.
 * `captchaSiteKey` is Turnstile's site key while the bot check is on.
 */
export function ResendVerificationForm({ email, captchaSiteKey }: { email: string | null; captchaSiteKey?: string }) {
  const [state, formAction] = useActionState(resendVerificationAction, IDLE_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <FormAlert state={state} />

      {email ? null : (
        <Field id="resend-email" label="Email" error={errors.email} required>
          <Input
            {...fieldA11y("resend-email", errors.email)}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
          />
        </Field>
      )}

      <TurnstileField siteKey={captchaSiteKey} action="resend" />

      <SubmitButton variant="secondary" className="w-full">
        {email ? "Resend verification email" : "Send verification email"}
      </SubmitButton>
    </form>
  );
}
