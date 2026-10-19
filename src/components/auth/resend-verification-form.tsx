"use client";

import { useActionState } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { resendVerificationAction } from "@/lib/auth/actions";
import { IDLE_STATE } from "@/lib/forms/action-state";

/**
 * Lets a student request another verification email. When the address is
 * already known (from the registration just completed) only a button is shown.
 */
export function ResendVerificationForm({ email }: { email: string | null }) {
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

      <SubmitButton variant="secondary" className="w-full">
        {email ? "Resend verification email" : "Send verification email"}
      </SubmitButton>
    </form>
  );
}
