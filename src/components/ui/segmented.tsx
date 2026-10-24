"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A row of mutually exclusive options (a radio group styled as a segmented
 * control) for short single choices: theme, number of questions, view mode.
 * Native radios, so arrow keys move between the options and Tab leaves.
 */
export function Segmented<T extends string>({
  label,
  hideLabel = true,
  name,
  value,
  onChange,
  options,
  className,
  size = "md",
  fill = false,
  disabled = false,
}: {
  label: string;
  hideLabel?: boolean;
  name: string;
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string }>;
  className?: string;
  size?: "sm" | "md";
  /** Options share the full width (a dialog's mode switch). */
  fill?: boolean;
  disabled?: boolean;
}) {
  return (
    <fieldset className={cn("min-w-0", className)} disabled={disabled}>
      <legend className={cn("mb-2 text-sm font-medium", hideLabel && "sr-only")}>{label}</legend>
      <div className={cn("max-w-full flex-wrap gap-1 rounded-xl border border-border bg-muted p-1", fill ? "flex w-full" : "inline-flex")}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              title={option.title}
              className={cn(
                "flex cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg font-medium transition-[background-color,color,box-shadow] duration-150",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring",
                size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
                "pointer-coarse:h-11 pointer-coarse:min-w-11",
                fill && "flex-1",
                selected ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input type="radio" name={name} value={option.value} checked={selected} onChange={() => onChange(option.value)} className="sr-only" />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
