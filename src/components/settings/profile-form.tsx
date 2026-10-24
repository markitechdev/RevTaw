"use client";

import { useActionState } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { IDLE_STATE } from "@/lib/forms/action-state";
import { updateProfileAction } from "@/lib/profile/actions";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/validation/limits";

export function ProfileForm({ displayName, email }: { displayName: string; email: string }) {
  const [state, formAction] = useActionState(updateProfileAction, IDLE_STATE);
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
          defaultValue={state.values?.displayName ?? displayName}
        />
      </Field>

      <Field
        id="email"
        label="Email"
        hint="Your email is used to sign in and cannot be changed here yet."
      >
        <Input id="email" type="email" value={email} readOnly disabled />
      </Field>

      <div>
        <SubmitButton>Save changes</SubmitButton>
      </div>
    </form>
  );
}
