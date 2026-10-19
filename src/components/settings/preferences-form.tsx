"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  StudyPreferencesFields,
  type StudyPreferenceDefaults,
} from "@/components/profile/study-preferences-fields";
import { IDLE_STATE } from "@/lib/forms/action-state";
import { updatePreferencesAction } from "@/lib/profile/actions";

export function PreferencesForm({ defaults }: { defaults: StudyPreferenceDefaults }) {
  const [state, formAction] = useActionState(updatePreferencesAction, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormAlert state={state} />
      <StudyPreferencesFields
        defaults={{ ...defaults, submitted: state.values }}
        errors={state.fieldErrors}
      />
      <div>
        <SubmitButton>Save preferences</SubmitButton>
      </div>
    </form>
  );
}
