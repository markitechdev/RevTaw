"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { confirmEmailLinkAction } from "@/lib/auth/confirm-actions";
import type { ConfirmType } from "@/lib/auth/confirm";
import { IDLE_STATE } from "@/lib/forms/action-state";

/** The button on /auth/confirm: the email link is used only when the student presses it. */
export function ConfirmLinkForm({ tokenHash, type, next, label }: { tokenHash: string; type: ConfirmType; next?: string; label: string }) {
  const [state, formAction] = useActionState(confirmEmailLinkAction, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      {next && <input type="hidden" name="next" value={next} />}

      <FormAlert state={state} />

      <SubmitButton size="lg" className="w-full">
        {label}
      </SubmitButton>

      <p className="text-center text-xs text-muted-foreground">
        Did not ask for this email? Close this page; nothing changes until you press the button.
      </p>
    </form>
  );
}
