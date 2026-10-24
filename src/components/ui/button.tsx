import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "danger-ghost" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm",
  secondary: "bg-card text-foreground border border-border hover:border-input hover:bg-muted",
  /** Tinted with the theme color: a quieter call to action next to a primary one. */
  soft: "bg-primary-soft text-primary hover:bg-primary-soft/70 ring-1 ring-inset ring-primary/15",
  ghost: "text-foreground hover:bg-muted",
  danger: "bg-danger text-danger-foreground hover:bg-danger/90 shadow-sm",
  /** A quiet delete or remove: danger text, tinted only on hover (the confirmation carries the weight). */
  "danger-ghost": "text-danger hover:bg-danger-soft",
  /** Text that acts: underlined at rest like any link in text, with no button box (sizes set only its text size). */
  link: "touch-target relative text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary",
};

/** On touch screens every size is at least 44 px tall (and icon buttons 44 px wide), a fingertip's target. */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 pointer-coarse:h-11 pointer-coarse:min-w-11",
  md: "h-10 px-4 text-sm gap-2 pointer-coarse:h-11 pointer-coarse:min-w-11",
  lg: "h-12 px-6 text-base gap-2",
  icon: "h-10 w-10 pointer-coarse:h-11 pointer-coarse:w-11",
  /** Icon buttons inside rows, toolbars and editors. */
  "icon-sm": "h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11",
};

/** The link variant takes a size's text size only: no height or padding, so it sits in a sentence. */
const LINK_SIZES: Record<ButtonSize, string> = {
  sm: "text-sm gap-1.5",
  md: "text-sm gap-2",
  lg: "text-base gap-2",
  icon: "",
  "icon-sm": "",
};

const sizeClasses = (variant: ButtonVariant, size: ButtonSize) => (variant === "link" ? LINK_SIZES[size] : SIZES[size]);

/** Shared by <Button> and buttonClasses(): a small press-down on click, motion on transform only. */
const BASE =
  "inline-flex cursor-pointer select-none items-center justify-center rounded-lg font-medium " +
  "transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out " +
  "active:translate-y-px";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading = false, disabled, children, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        BASE,
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0",
        VARIANTS[variant],
        sizeClasses(variant, size),
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

/** Same look as <Button>, for <Link> and <a>. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    BASE,
    VARIANTS[variant],
    sizeClasses(variant, size),
    className,
  );
}
