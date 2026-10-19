"use client";

import { useActionState } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert, FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { forgotPasswordAction } from "@/lib/auth/actions";
import { IDLE_STATE } from "@/lib/forms/action-state";

export function ForgotPasswordForm({ expired }: { expired?: boolean }) {
  const [state, formAction] = useActionState(forgotPasswordAction, IDLE_STATE);
  const errors = state.fieldErrors ?? {};

  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert state={state} />
        <p className="text-sm text-muted-foreground">
          Did not get it? Check your spam folder, or try again in a minute.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.status === "idle" && expired && (
        <Alert tone="error">
          That reset link has expired or was already used. Request a new one below.
        </Alert>
      )}
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

      <SubmitButton size="lg" className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}
