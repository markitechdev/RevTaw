import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { TINT } from "@/components/ui/tint";
import { cn } from "@/lib/utils";

/** Calm, specific error message with an optional retry or escape action. */
export function ErrorState({
  title = "Something went wrong",
  description,
  action,
  className,
  titleAs: Title = "p",
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** "h1" when the error stands in for the whole page. */
  titleAs?: "p" | "h1" | "h2";
}) {
  return (
    <div
      role="alert"
      className={cn(
        `flex flex-col items-center gap-3 rounded-xl border px-6 py-10 text-center ${TINT.danger}`,
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-danger">
        <TriangleAlert className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <Title className="font-medium text-foreground">{title}</Title>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
