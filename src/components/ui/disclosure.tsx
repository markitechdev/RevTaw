"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Progressive disclosure: a quiet toggle ("Advanced options") that reveals
 * extra controls. Content stays mounted when closed so form fields keep their
 * values and still submit.
 */
export function Disclosure({
  label,
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  label: ReactNode;
  /** One line describing the current advanced settings while collapsed. */
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((value) => !value)}
        className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg py-2 text-left text-sm font-medium text-foreground hover:text-primary"
      >
        <span className="flex min-w-0 flex-col">
          <span>{label}</span>
          {summary && !open && <span className="truncate text-xs font-normal text-muted-foreground">{summary}</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div id={regionId} hidden={!open} className="pt-2">
        {children}
      </div>
    </div>
  );
}
