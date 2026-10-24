"use client";

import { ArchiveRestore, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { purgeMaterialAction, setMaterialArchivedAction } from "@/lib/materials/organize-actions";
import { KEPT_ITEMS } from "@/lib/materials/retention";
import { routes } from "@/lib/routes";

/**
 * Brings an archived material back. `then` decides where the student lands:
 * the material itself (Undo) or the same page refreshed (the Archive card,
 * the material page).
 */
export function RestoreMaterialButton({
  materialId,
  label = "Restore",
  then = "refresh",
  size = "sm",
  variant = "secondary",
}: {
  materialId: string;
  label?: string;
  then?: "refresh" | "open";
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await setMaterialArchivedAction(materialId, false);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            if (then === "open") router.push(`${routes.materials}/${materialId}`);
            else router.refresh();
          })
        }
      >
        {!pending && <ArchiveRestore className="h-4 w-4" aria-hidden="true" />}
        {label}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

/** "Delete permanently" with a confirmation that says exactly what goes and what stays. */
export function PurgeMaterialButton({
  materialId,
  title,
  placement,
  size = "sm",
  variant = "ghost",
}: {
  materialId: string;
  title: string;
  /** "General Biology · Cells", where what was made from it stays filed. */
  placement: string | null;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (!pending) setOpen(false);
  };
  return (
    <>
      <Button
        type="button"
        variant={variant === "ghost" ? "danger-ghost" : variant}
        size={size}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Delete permanently
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete permanently?"
        confirmLabel="Delete permanently"
        pending={pending}
        error={error}
        onCancel={close}
        onConfirm={() =>
          startTransition(async () => {
            setError(null);
            const result = await purgeMaterialAction(materialId);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setOpen(false);
            router.push(`${routes.materials}?archived=1&notice=purged`);
          })
        }
      >
        <Alert tone="error">
          The file of “{title}”, its extracted text and its analysis will be deleted now. This can&apos;t be undone.
        </Alert>
        <p className="text-sm text-muted-foreground">
          {KEPT_ITEMS} made from it stay{placement ? `, filed under ${placement}` : ""}.
        </p>
      </ConfirmDialog>
    </>
  );
}
