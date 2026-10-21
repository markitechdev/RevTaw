"use client";

import { useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import {
  EDUCATION_LEVELS,
  SESSION_CUSTOM,
  SESSION_MAX_MINUTES,
  SESSION_MIN_MINUTES,
  SESSION_PRESETS,
  STUDY_GOALS,
} from "@/lib/profile/options";
import { cn } from "@/lib/utils";

export type StudyPreferenceDefaults = {
  educationLevel?: string | null;
  mainGoal?: string | null;
  sessionMinutes?: number | null;
  /** Raw values from a failed submission, which win over saved defaults. */
  submitted?: Record<string, string>;
};

export function ChoiceGroup({
  legend,
  description,
  error,
  children,
  className,
}: {
  legend: string;
  description?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  const errorId = error ? `${legend.replace(/\s+/g, "-").toLowerCase()}-error` : undefined;
  return (
    <fieldset aria-describedby={errorId} aria-invalid={error ? true : undefined}>
      <legend className="text-base font-semibold text-foreground">{legend}</legend>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className={cn("mt-3", className)}>{children}</div>
      {error && (
        <p id={errorId} className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function ChoiceCard({
  name,
  value,
  label,
  hint,
  defaultChecked,
  onChange,
  compact,
}: {
  name: string;
  value: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  onChange?: () => void;
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card text-sm transition-colors",
        "hover:bg-muted/60 has-checked:border-primary has-checked:bg-primary-soft",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
        compact ? "px-3 py-2" : "p-3",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium text-foreground">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export function StudyPreferencesFields({
  defaults,
  errors = {},
}: {
  defaults: StudyPreferenceDefaults;
  errors?: Record<string, string>;
}) {
  const submitted = defaults.submitted ?? {};
  const educationLevel = submitted.educationLevel ?? defaults.educationLevel ?? "";
  const mainGoal = submitted.mainGoal ?? defaults.mainGoal ?? "";

  const savedMinutes = defaults.sessionMinutes ?? null;
  const savedIsPreset =
    savedMinutes !== null &&
    SESSION_PRESETS.includes(savedMinutes as (typeof SESSION_PRESETS)[number]);
  const initialChoice =
    submitted.sessionChoice ??
    (savedMinutes === null ? "" : savedIsPreset ? String(savedMinutes) : SESSION_CUSTOM);
  const initialCustom =
    submitted.customMinutes ?? (savedMinutes !== null && !savedIsPreset ? String(savedMinutes) : "");

  const [sessionChoice, setSessionChoice] = useState(initialChoice);
  const sessionError = errors["session.sessionChoice"] ?? errors["session"];
  const customError = errors["session.customMinutes"];

  return (
    <div className="flex flex-col gap-8">
      <ChoiceGroup
        legend="Education level"
        description="Helps RevTaw pitch explanations and questions at the right level."
        error={errors.educationLevel}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {EDUCATION_LEVELS.map((item) => (
          <ChoiceCard
            key={item.value}
            name="educationLevel"
            value={item.value}
            label={item.label}
            defaultChecked={educationLevel === item.value}
            compact
          />
        ))}
      </ChoiceGroup>

      <ChoiceGroup
        legend="Main goal"
        description="Shapes which study methods RevTaw recommends first."
        error={errors.mainGoal}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {STUDY_GOALS.map((item) => (
          <ChoiceCard
            key={item.value}
            name="mainGoal"
            value={item.value}
            label={item.label}
            hint={item.hint}
            defaultChecked={mainGoal === item.value}
          />
        ))}
      </ChoiceGroup>

      <ChoiceGroup
        legend="Preferred session length"
        description="Sessions are built to fit this time. You can always pick a different length when you start one."
        error={sessionError}
        className="flex flex-col gap-3"
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {SESSION_PRESETS.map((minutes) => (
            <ChoiceCard
              key={minutes}
              name="sessionChoice"
              value={String(minutes)}
              label={`${minutes} min`}
              defaultChecked={sessionChoice === String(minutes)}
              onChange={() => setSessionChoice(String(minutes))}
              compact
            />
          ))}
          <ChoiceCard
            name="sessionChoice"
            value={SESSION_CUSTOM}
            label="Custom"
            defaultChecked={sessionChoice === SESSION_CUSTOM}
            onChange={() => setSessionChoice(SESSION_CUSTOM)}
            compact
          />
        </div>

        {sessionChoice === SESSION_CUSTOM && (
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <label htmlFor="customMinutes" className="text-sm font-medium text-foreground">
              Custom length (minutes)
            </label>
            <Input
              id="customMinutes"
              name="customMinutes"
              type="number"
              inputMode="numeric"
              min={SESSION_MIN_MINUTES}
              max={SESSION_MAX_MINUTES}
              step={1}
              defaultValue={initialCustom}
              aria-invalid={customError ? true : undefined}
              aria-describedby={customError ? "customMinutes-error" : undefined}
            />
            {customError && (
              <p id="customMinutes-error" className="text-sm text-danger">
                {customError}
              </p>
            )}
          </div>
        )}
      </ChoiceGroup>
    </div>
  );
}
