"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A panel that slides in from the right (desktop) or up from the bottom
 * (mobile, `side="responsive"`). Built on the native <dialog>: focus is
 * trapped, Escape closes it, the backdrop click dismisses it.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = "responsive",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: "right" | "bottom" | "responsive";
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 max-h-none max-w-none border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-black/40 open:flex open:flex-col",
        side === "right" && "inset-y-0 right-0 left-auto h-dvh w-[26rem] max-w-[92vw] border-l open:animate-panel-in",
        side === "bottom" && "inset-x-0 top-auto bottom-0 max-h-[88dvh] w-full rounded-t-2xl border-t open:animate-sheet-up",
        side === "responsive" &&
          "inset-x-0 top-auto bottom-0 max-h-[88dvh] w-full rounded-t-2xl border-t open:animate-sheet-up sm:inset-y-0 sm:right-0 sm:left-auto sm:h-dvh sm:max-h-none sm:w-[26rem] sm:max-w-[92vw] sm:rounded-none sm:border-t-0 sm:border-l sm:open:animate-panel-in",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
    </dialog>
  );
}
