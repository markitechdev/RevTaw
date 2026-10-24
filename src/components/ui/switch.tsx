"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** An on/off setting: a real switch for assistive technology, a label you can click. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-foreground">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "touch-target relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
          checked ? "border-primary bg-primary" : "border-input bg-muted",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-[18px] w-[18px] rounded-full shadow-sm transition-transform duration-200 ease-out",
            checked ? "translate-x-[22px] bg-primary-foreground" : "translate-x-[2px] bg-card ring-1 ring-input",
          )}
        />
      </button>
    </div>
  );
}
