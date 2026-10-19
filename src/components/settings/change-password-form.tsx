"use client";

import { useActionState } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { IDLE_STATE } from "@/lib/forms/action-state";
import { changePasswordAction } from "@/lib/profile/actions";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, IDLE_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />

      <Field id="currentPassword" label="Current password" error={errors.currentPassword} required>
        <PasswordInput
          {...fieldA11y("currentPassword", errors.currentPassword)}
          name="currentPassword"
          autoComplete="current-password"
          required
        />
      </Field>

      <Field
        id="password"
        label="New password"
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

      <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword} required>
        <PasswordInput
          {...fieldA11y("confirmPassword", errors.confirmPassword)}
          name="confirmPassword"
          autoComplete="new-password"
          required
        />
      </Field>

      <div>
        <SubmitButton>Change password</SubmitButton>
      </div>
    </form>
  );
}
