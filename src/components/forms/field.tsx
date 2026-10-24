import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type FieldProps = {
  id: string;
  label: ReactNode;
  /** Validation message rendered below the control and linked via aria-describedby. */
  error?: string;
  /** Helper text rendered below the control (and below an error), always. */
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

/** Returns the aria attributes a control inside <Field> should spread. */
export function fieldA11y(id: string, error?: string, hint?: ReactNode) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  } as const;
}

export function Field({ id, label, error, hint, required, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
      {/* The rules stay in view when the value is rejected: that is when they are needed most. */}
      {hint && (
        <p id={`${id}-hint`} className={cn(error ? "mt-1" : "mt-1.5", "text-sm text-muted-foreground")}>
          {hint}
        </p>
      )}
    </div>
  );
}
