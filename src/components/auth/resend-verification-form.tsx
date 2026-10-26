"use client";

import { useActionState, useState } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { TurnstileField } from "@/components/forms/turnstile-field";
import { Input } from "@/components/ui/input";
import { resendVerificationAction } from "@/lib/auth/actions";
import { IDLE_STATE } from "@/lib/forms/action-state";
import { useNow } from "@/lib/hooks/use-now";

/** The wait before another email, from the page: `key` is new for every email sent, so each starts its own count. */
export type ResendCooldown = { seconds: number; key: string };

/**
 * Lets a student request another verification email. When the address is
 * already known (from the registration just completed) only a button is shown.
 * The button waits a minute after every email (`cooldown`, which the page
 * reads again after each request). `captchaSiteKey` is Turnstile's site key
 * while the bot check is on.
 */
export function ResendVerificationForm({
  email,
  cooldown,
  captchaSiteKey,
}: {
  email: string | null;
  cooldown: ResendCooldown | null;
  captchaSiteKey?: string;
}) {
  const [state, formAction] = useActionState(resendVerificationAction, IDLE_STATE);
  const errors = state.fieldErrors ?? {};
  const label = email ? "Resend verification email" : "Send verification email";

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

      {cooldown ? (
        <CountdownButton key={cooldown.key} seconds={cooldown.seconds} label={label} />
      ) : (
        <SubmitButton variant="secondary" className="w-full">
          {label}
        </SubmitButton>
      )}
    </form>
  );
}

/**
 * The submit button held back while `seconds` run out, counted on this
 * device's clock from when it appears (the server's own limit still decides).
 * The server and the first render show `seconds` as given, so the markup
 * matches while hydrating; the clock takes over after.
 */
function CountdownButton({ seconds, label }: { seconds: number; label: string }) {
  const now = useNow();
  // Fixed when the button appears: a new email gives it a new key, and with it a new count.
  const [endsAt] = useState(() => Date.now() + seconds * 1000);
  // Never above `seconds`: the shared clock can be a moment stale when the button first subscribes.
  const left = now === null ? seconds : Math.min(seconds, Math.max(0, Math.ceil((endsAt - now) / 1000)));

  return (
    <>
      <SubmitButton variant="secondary" className="w-full" disabled={left > 0}>
        {left > 0 ? (
          <span>
            Resend email in <span className="tabular-nums" aria-hidden="true">{left}s</span>
            <span className="sr-only">
              {left} second{left === 1 ? "" : "s"}
            </span>
          </span>
        ) : (
          label
        )}
      </SubmitButton>
      {/* Said once, when the wait is over: the count itself is not read out every second. */}
      <p role="status" className="sr-only">
        {left > 0 ? "" : "You can ask for another verification email now."}
      </p>
    </>
  );
}
