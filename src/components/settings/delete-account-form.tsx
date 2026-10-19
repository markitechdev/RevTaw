"use client";

import { useActionState, useState } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert, FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IDLE_STATE } from "@/lib/forms/action-state";
import { deleteAccountAction } from "@/lib/profile/actions";

/**
 * Two-step destructive action: the form is hidden behind an explicit button,
 * then requires the password and a typed confirmation before submitting.
 */
export function DeleteAccountForm({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteAccountAction, IDLE_STATE);
  const errors = state.fieldErrors ?? {};

  if (!enabled) {
    return (
      <Alert tone="info">
        Account deletion is not available on this server yet. Contact support if you need your
        data removed.
      </Alert>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Alert tone="error">
        This permanently deletes your account, uploaded materials, reviewers, quizzes, flashcards
        and progress. There is no undo.
      </Alert>
      <FormAlert state={state} />

      <Field id="delete-password" label="Your password" error={errors.password} required>
        <PasswordInput
          {...fieldA11y("delete-password", errors.password)}
          name="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Field
        id="delete-confirmation"
        label='Type "DELETE" to confirm'
        error={errors.confirmation}
        required
      >
        <Input
          {...fieldA11y("delete-confirmation", errors.confirmation)}
          name="confirmation"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton variant="danger">Permanently delete account</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
