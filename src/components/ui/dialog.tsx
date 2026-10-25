"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";

import { SECTION_TITLE } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

/**
 * A dialog's buttons. On phones they stack, full width, with the main action on top and Cancel at the
 * bottom; from `sm` up they sit in a row at the end, Cancel first. Put Cancel first and the main action
 * last in the markup.
 */
export const DIALOG_ACTIONS = "flex flex-col-reverse gap-2 *:w-full sm:flex-row sm:flex-wrap sm:justify-end sm:*:w-auto";

/**
 * Moves the focus to an element (by id) once a dialog has closed. The browser hands the focus back to
 * whatever opened the dialog, but a menu item that opened it is gone by then; call the returned function
 * when closing the dialog, and the focus goes there right after the dialog shuts.
 */
export function useFocusAfterClose(open: boolean): (id: string) => void {
  const target = useRef<string | null>(null);
  // After every commit: the dialog's own effect has already closed it (a child's effects run first).
  useEffect(() => {
    if (open || !target.current) return;
    document.getElementById(target.current)?.focus();
    target.current = null;
  });
  return useCallback((id: string) => {
    target.current = id;
  }, []);
}

/**
 * Modal built on the native <dialog> element: focus is trapped, Escape closes
 * it and the backdrop click dismisses it. `open` is controlled by the parent.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** When false, Escape and backdrop clicks are ignored (e.g. mid-upload). */
  dismissible?: boolean;
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
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border bg-card p-0 text-foreground shadow-pop",
        "backdrop:bg-black/45 open:animate-pop-in",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className={SECTION_TITLE}>
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
    </dialog>
  );
}
