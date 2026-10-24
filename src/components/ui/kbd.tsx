import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** A keyboard key, e.g. <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>. */
export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-muted px-1 font-sans text-2xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
