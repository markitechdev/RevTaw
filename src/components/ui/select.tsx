import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";

import { FIELD_HEIGHT, type FieldSize } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Native select with consistent styling; keyboard and screen-reader friendly by default. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { fieldSize?: FieldSize }>(
  ({ className, children, fieldSize = "md", ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "w-full appearance-none rounded-lg border border-input bg-card pl-3 pr-9 text-sm text-foreground",
          FIELD_HEIGHT[fieldSize],
          "transition-colors focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-60",
          "aria-[invalid=true]:border-danger",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  ),
);
Select.displayName = "Select";
