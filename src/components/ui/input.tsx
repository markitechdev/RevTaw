import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground " +
  "transition-colors focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(base, "h-10", className)} {...props} />
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
