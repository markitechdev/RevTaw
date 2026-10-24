"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  ChoiceCard,
  ChoiceGroup,
  StudyPreferencesFields,
  type StudyPreferenceDefaults,
} from "@/components/profile/study-preferences-fields";
import { IDLE_STATE } from "@/lib/forms/action-state";
import { RESPONSE_LANGUAGES } from "@/lib/preferences/options";
import { completeOnboardingAction } from "@/lib/profile/actions";

/** The onboarding language question (UI phase §24); "Other" is set later in Settings → AI. */
const ONBOARDING_LANGUAGES = RESPONSE_LANGUAGES.filter((item) => item.id !== "other");

export function OnboardingForm({ defaults }: { defaults: StudyPreferenceDefaults }) {
  const [state, formAction] = useActionState(completeOnboardingAction, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      <FormAlert state={state} />
      <StudyPreferencesFields
        defaults={{ ...defaults, submitted: state.values }}
        errors={state.fieldErrors}
      />
      <ChoiceGroup
        legend="Which language should RevTaw answer in?"
        description="For explanations and chats. You can switch any time, or just ask in a message."
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {ONBOARDING_LANGUAGES.map((item) => (
          <ChoiceCard
            key={item.id}
            name="responseLanguage"
            value={item.id}
            label={item.label}
            hint={item.hint}
            defaultChecked={(state.values?.responseLanguage ?? "auto") === item.id}
          />
        ))}
      </ChoiceGroup>
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
