"use client";

import type { ReactNode } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DIALOG_ACTIONS } from "@/components/ui/dialog";

/**
 * Asks before an action that cannot be undone, such as a delete: the title names it, the description (or a
 * longer body as children) says what goes and what stays, and the confirm button repeats the action
 * ("Delete task"). Cancel is the safe way out; while the action runs the dialog cannot be dismissed. The
 * confirm button is red for a delete; `tone="primary"` is for an action that keeps the student's work
 * (ending a session), so red stays the sign of something lost.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  tone = "danger",
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** A longer body than the description: a warning, what stays and where. */
  children?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} dismissible={!pending} title={title} description={description} className="max-w-120">
      <div className="flex flex-col gap-4">
        {children}
        {error && <Alert tone="error">{error}</Alert>}
        <div className={DIALOG_ACTIONS}>
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant={tone} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
