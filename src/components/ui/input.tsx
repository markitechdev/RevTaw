import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground " +
  "transition-colors focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-[invalid=true]:border-danger";

/**
 * A field is as tall as the buttons beside it: "md" (40 px) in forms, "sm" (32 px) inline in a row of small
 * buttons or as a filter above a list. On touch screens both are 44 px, a fingertip's target, like the buttons.
 */
export type FieldSize = "sm" | "md";
export const FIELD_HEIGHT: Record<FieldSize, string> = { sm: "h-8 pointer-coarse:h-11", md: "h-10 pointer-coarse:h-11" };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { fieldSize?: FieldSize }>(
  ({ className, fieldSize = "md", ...props }, ref) => (
    <input ref={ref} className={cn(base, FIELD_HEIGHT[fieldSize], className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-24 py-2", className)} {...props} />
));
Textarea.displayName = "Textarea";
