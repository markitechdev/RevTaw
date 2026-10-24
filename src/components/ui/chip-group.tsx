"use client";

import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";

import { CHOICE_INPUT } from "@/components/ui/choice-input";
import { OptionCard } from "@/components/ui/option-card";
import { cn } from "@/lib/utils";

export type ChipOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Small second line (e.g. "Auto-graded"). */
  hint?: ReactNode;
  disabled?: boolean;
};

type Common<T extends string> = {
  legend: ReactNode;
  /** Visually hide the legend when the surrounding UI already labels the group. */
  hideLegend?: boolean;
  description?: ReactNode;
  name: string;
  options: ReadonlyArray<ChipOption<T>>;
  className?: string;
  /** "chip" for short labels, "card" for options with a hint line (the shared OptionCard). */
  look?: "chip" | "card";
  /** Columns of cards at full width: 1 in a narrow dialog, 2 in most dialogs, 3 on a page. */
  columns?: 1 | 2 | 3;
  /** "sm" makes chips compact (filters above a list or calendar). */
  size?: "sm" | "md";
  /** The whole group, while its form is busy. */
  disabled?: boolean;
};

type MultipleProps<T extends string> = Common<T> & {
  type: "multiple";
  value: ReadonlyArray<T>;
  onChange: (next: T[]) => void;
};

type SingleProps<T extends string> = Common<T> & {
  type: "single";
  value: T | null;
  onChange: (next: T) => void;
};

/**
 * Selectable chips backed by real checkboxes (pick any number) or radio
 * buttons (pick one): keyboard, screen readers and form posts work as with
 * native inputs, and the selected ones are obvious at a glance (tinted, with
 * a check mark).
 */
export function ChipGroup<T extends string>(props: MultipleProps<T> | SingleProps<T>) {
  const { legend, hideLegend = false, description, name, options, className, look = "chip", columns = 3, size = "md", disabled = false } = props;
  const small = size === "sm" && look === "chip";
  const descriptionId = useId();
  const isSelected = (value: T) => (props.type === "multiple" ? props.value.includes(value) : props.value === value);

  const toggle = (value: T) => {
    if (props.type === "multiple") {
      props.onChange(props.value.includes(value) ? props.value.filter((item) => item !== value) : [...props.value, value]);
    } else {
      props.onChange(value);
    }
  };

  return (
    <fieldset disabled={disabled} className={cn("flex min-w-0 flex-col gap-2", className)} aria-describedby={description ? descriptionId : undefined}>
      <legend className={cn("mb-2 text-sm font-medium text-foreground", hideLegend && "sr-only")}>{legend}</legend>
      {description && (
        <p id={descriptionId} className="-mt-1 text-xs text-muted-foreground">
          {description}
        </p>
      )}
      <div className={cn(look === "card" ? cn("grid grid-cols-1 gap-2", columns >= 2 && "sm:grid-cols-2", columns === 3 && "lg:grid-cols-3") : small ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-2")}>
        {options.map((option) => {
          const selected = isSelected(option.value);
          if (look === "card") {
            return (
              <OptionCard
                key={option.value}
                type={props.type === "multiple" ? "checkbox" : "radio"}
                name={name}
                value={option.value}
                checked={selected}
                disabled={option.disabled}
                onChange={() => toggle(option.value)}
                label={option.label}
                hint={option.hint}
              />
            );
          }
          return (
            <label
              key={option.value}
              className={cn(
                "group relative flex cursor-pointer select-none items-start gap-2 border text-sm transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98]",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                small ? "items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" : "rounded-full px-3.5 py-1.5",
                // A fingertip's target on touch screens.
                "pointer-coarse:min-h-11 pointer-coarse:items-center",
                selected ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-foreground hover:border-input",
                "has-disabled:cursor-not-allowed has-disabled:opacity-60 has-disabled:active:scale-100",
              )}
            >
              <input
                type={props.type === "multiple" ? "checkbox" : "radio"}
                name={name}
                value={option.value}
                checked={selected}
                disabled={option.disabled}
                onChange={() => toggle(option.value)}
                className={CHOICE_INPUT}
              />
              <span
                aria-hidden="true"
                className={cn(
                  "flex shrink-0 items-center justify-center border transition-colors",
                  small ? "h-3.5 w-3.5" : "mt-0.5 h-4 w-4 pointer-coarse:mt-0",
                  props.type === "multiple" ? "rounded-[5px]" : "rounded-full",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
                )}
              >
                {selected && <Check className={small ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={3} />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={cn("font-medium", small ? "leading-4" : "leading-5")}>{option.label}</span>
                {option.hint && <span className={cn("text-xs", selected ? "text-primary" : "text-muted-foreground")}>{option.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
