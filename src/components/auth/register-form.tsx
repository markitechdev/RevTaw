"use client";

import { useActionState } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { registerAction } from "@/lib/auth/actions";
import { IDLE_STATE } from "@/lib/forms/action-state";
import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/validation/auth";

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, IDLE_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />

      <Field id="displayName" label="Name" error={errors.displayName} required>
        <Input
          {...fieldA11y("displayName", errors.displayName)}
          name="displayName"
          type="text"
          autoComplete="name"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          required
          defaultValue={state.values?.displayName ?? ""}
        />
      </Field>

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

      <Field
        id="password"
        label="Password"
        error={errors.password}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. Longer is stronger.`}
        required
      >
        <PasswordInput
          {...fieldA11y("password", errors.password, true)}
          name="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          required
        />
      </Field>

      <SubmitButton size="lg" className="w-full">
        Create account
      </SubmitButton>

      <p className="text-center text-xs text-muted-foreground">
        We will send a verification link to your email before you can sign in.
      </p>
    </form>
  );
}
