import { Check } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";

import { CHOICE_INPUT } from "@/components/ui/choice-input";
import { cn } from "@/lib/utils";

type OptionCardProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  /** "radio" to pick one of a group, "checkbox" to pick any number. */
  type?: "radio" | "checkbox";
  label: ReactNode;
  /** A short second line: what picking it means. */
  hint?: ReactNode;
  className?: string;
};

/**
 * The one option card: a choice with a name and a line about it, backed by a real radio or checkbox (so
 * keyboards, screen readers and form posts work as usual). Its look follows the input itself, so it works
 * controlled (checked + onChange) or in a plain form (defaultChecked): tinted with a check when picked,
 * dimmed when disabled. ChipGroup's card look renders these.
 */
export function OptionCard({ type = "radio", label, hint, className, ...input }: OptionCardProps) {
  return (
    <label
      className={cn(
        "group/option relative flex cursor-pointer select-none items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-sm pointer-coarse:min-h-11",
        "transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-input active:scale-[0.98]",
        "has-checked:border-primary has-checked:bg-primary-soft",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
        "has-disabled:cursor-not-allowed has-disabled:opacity-60 has-disabled:hover:border-border has-disabled:active:scale-100",
        className,
      )}
    >
      <input type={type} className={CHOICE_INPUT} {...input} />
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-input bg-card text-primary-foreground transition-colors",
          "group-has-checked/option:border-primary group-has-checked/option:bg-primary",
          type === "checkbox" ? "rounded-[5px]" : "rounded-full",
        )}
      >
        <Check className="hidden h-3 w-3 group-has-checked/option:block" strokeWidth={3} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium leading-5 text-foreground group-has-checked/option:text-primary">{label}</span>
        {hint && <span className="text-xs text-muted-foreground group-has-checked/option:text-primary">{hint}</span>}
      </span>
    </label>
  );
}
