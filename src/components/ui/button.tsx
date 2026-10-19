import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
  secondary:
    "bg-card text-foreground border border-border hover:bg-muted",
  ghost: "text-foreground hover:bg-muted",
  danger: "bg-danger text-danger-foreground hover:bg-danger/90 shadow-sm",
  link: "text-primary underline-offset-4 hover:underline px-0 h-auto",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2",
  icon: "h-10 w-10",
};

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
        "inline-flex cursor-pointer items-center justify-center rounded-lg font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant],
        SIZES[size],
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
    "inline-flex cursor-pointer items-center justify-center rounded-lg font-medium transition-colors",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}
