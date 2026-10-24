"use client";

import { useActionState } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { TurnstileField } from "@/components/forms/turnstile-field";
import { Input } from "@/components/ui/input";
import { TEXT_LINK } from "@/components/ui/text-link";
import { registerAction } from "@/lib/auth/actions";
import { IDLE_STATE } from "@/lib/forms/action-state";
import { routes } from "@/lib/routes";
import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/validation/limits";

/** `captchaSiteKey`: Turnstile's site key while the bot check is on. */
export function RegisterForm({ captchaSiteKey }: { captchaSiteKey?: string }) {
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

      <div className="flex flex-col">
        {/* The whole row is the label, so the text is part of the box's target; the links open in a new tab and keep the form. */}
        <label htmlFor="agree" className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground pointer-coarse:min-h-11">
          <input
            id="agree"
            name="agree"
            type="checkbox"
            value="yes"
            required
            defaultChecked={state.values?.agree === "yes"}
            aria-invalid={errors.agree ? true : undefined}
            aria-describedby={errors.agree ? "agree-error" : undefined}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
          />
          <span>
            I agree to the{" "}
            <a href={routes.terms} target="_blank" rel="noopener" className={TEXT_LINK}>
              Terms of Use
              <span className="sr-only"> (opens in a new tab)</span>
            </a>{" "}
            and the{" "}
            <a href={routes.privacy} target="_blank" rel="noopener" className={TEXT_LINK}>
              Privacy Notice
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            . If I&apos;m under 18, my parent or guardian has read them and agrees too.
          </span>
        </label>
        {errors.agree && (
          <p id="agree-error" className="mt-1.5 text-sm text-danger">
            {errors.agree}
          </p>
        )}
      </div>

      <TurnstileField siteKey={captchaSiteKey} action="register" />

      <SubmitButton size="lg" className="w-full">
        Create account
      </SubmitButton>

      <p className="text-center text-xs text-muted-foreground">
        We will send a verification link to your email before you can sign in.
      </p>
    </form>
  );
}
