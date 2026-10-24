"use client";

import type { ReactNode } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * Asks before an action that cannot be undone, such as a delete: the title names it, the description says
 * what goes and what stays, and the danger button repeats the action ("Delete task"). Cancel is the safe way out.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={() => !pending && onCancel()} title={title} description={description}>
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="danger" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
