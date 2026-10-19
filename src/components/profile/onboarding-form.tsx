"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  StudyPreferencesFields,
  type StudyPreferenceDefaults,
} from "@/components/profile/study-preferences-fields";
import { IDLE_STATE } from "@/lib/forms/action-state";
import { completeOnboardingAction } from "@/lib/profile/actions";

export function OnboardingForm({ defaults }: { defaults: StudyPreferenceDefaults }) {
  const [state, formAction] = useActionState(completeOnboardingAction, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      <FormAlert state={state} />
      <StudyPreferencesFields
        defaults={{ ...defaults, submitted: state.values }}
        errors={state.fieldErrors}
      />
      <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          You can change any of these later in Settings.
        </p>
        <SubmitButton size="lg" className="sm:min-w-48">
          Start studying
        </SubmitButton>
      </div>
    </form>
  );
}
